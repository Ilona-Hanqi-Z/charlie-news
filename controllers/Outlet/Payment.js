'use strict';

const config = require('../../config');

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const stripe = require('../../lib/stripe');
const reporter = require('../../lib/reporter');

const Assignment = require('../../models/assignment');
const Post = require('../../models/post');
const Purchase = require('../../models/purchase');
const Outlet = require('../../models/outlet');
const OutletPayment = require('../../models/outlet_payment');
const User = require('../../models/user');

/**
 * Outlet payment class
 * @description Used to manage the CRUD operations around an outlet's payment methods
 */
class PaymentController {
    
    /**
     * Create a new payment method for the outlet
     * 
     * @param {bookshelf.Model} outlet_model    Outlet makeing the purchase
     * @param {object}  options
     * @param {string}  options.token           Stripe.JS card or verified bank token
     * @param {boolean} options.active          If true, this method will be the new main payment method
     * @param {knex.transaction} _trx           (optional)
     */
    createMethod(user_model, { token, active = false } = {}, _trx) {
        return new Promise((resolve, reject) => {
            let outlet_model = user_model.related('outlet');
            if (!outlet_model || !outlet_model.has('stripe_customer_id')) {
                return reject(ferror(ferror.INVALID_REQUEST).msg('Outlet is missing payment information'))
            }

            stripe.customers.createSource(
                outlet_model.get('stripe_customer_id'),
                { source: token },
                (err, source) => {
                    if (err) {
                        reject(ferror.stripe(err))
                    } else if (active) {
                        setDefaultSource(source)
                    } else {
                        fetchCustomer(source);
                    }
                }
            );

            function setDefaultSource(source) {
                stripe.customers.update(
                    outlet_model.get('stripe_customer_id'),
                    { default_source: source.id },
                    (err, customer) => {
                        if (err) {
                            reject(ferror.stripe(err))
                        } else {
                            makeOutletPayment(source, customer);
                        }
                    }
                );
            }

            function fetchCustomer(source) {
                stripe.customers.retrieve(
                    outlet_model.get('stripe_customer_id'),
                    (err, customer) => {
                        if (err) {
                            reject(ferror.stripe(err))
                        } else {
                            makeOutletPayment(source, customer)
                        }
                    }
                )
            }
            
            //Creates source in DB, defines TRX rollback in case of failure
            function makeOutletPayment(source, customer) {
                if (_trx) {
                    // Hook rolling back stripe into the rollback function for the transaction
                    _trx.__rollback = _trx.rollback
                    _trx.rollback = () => {
                        stripe.customers.deleteSource(outlet_model.get('stripe_customer_id'), source.id, err => {
                            if (err) {
                                reporter.report(err)
                            }
                        })
                        _trx.__rollback()
                    }
                }
                
                OutletPayment
                    .forge({
                        outlet_id: outlet_model.get('id'),
                        stripe_source_id: source.id,
                        type: source.object,
                        brand: source.brand || source.bank_name,
                        last4: source.last4,
                        active: customer.default_source === source.id
                    })
                    .save(null, { transacting: _trx, returning: OutletPayment.FILTERS.PUBLIC })
                    .then(result => resolve(result))
                    .catch(ferror.trip(reject))
            }
        })
    }

    /**
     * Create new Stripe customer and attach to outlet object
     * 
     * @param {bookshelf.model} outlet_model        Outlet model to attach customer to
     * @param {knex.transaction} _trx                (optional)
     */
    generateNewCustomer(outlet_model, _trx) {
        let stripeParams = {
            description: outlet_model.get('title')
        }
        
        return new Promise((resolve, reject) => {
            let _cus = null
            
            stripe.customers.create(stripeParams, (err, cus) => {
                if (err) {
                    reject(ferror.stripe(err))
                } else {
                    _cus = cus
                    savePaymentInfo()
                } 
            })
            
            function savePaymentInfo() {
                outlet_model
                    .save({ stripe_customer_id: _cus.id }, { transacting: _trx, patch: true })
                    .then(done)
                    .catch(ferror.constraint(reject))
            }
            
            function done() {
                if (_trx) {
                    // Hook rolling back stripe into the rollback function for the transaction
                    _trx.__rollback = _trx.rollback
                    _trx.rollback = () => {
                        stripe.customers.del(_cus.id, err => {
                            if (err) {
                                reporter.report(err);
                            }
                        })
                        _trx.__rollback()
                    }
                }
                
                resolve(outlet_model)
            }
        })
    }
    
    /**
     * List the outlet's payment methods
     * 
     * @param {bookshelf.Model} outlet_model    Outlet's model
     * @param {int[]} _payment_ids              (optional) Which payment to return
     */
    listMethods(user_model, _payment_ids) {
        return new Promise((resolve, reject) => {
            OutletPayment
                .query(qb => {
                    qb.where('outlet_id', user_model.related('outlet').get('id'))
                    if (_payment_ids) qb.whereIn('id', _payment_ids)
                    qb.columns(OutletPayment.FILTERS.PUBLIC)
                })
                .fetchAll()
                .then(results => resolve(results))
                .catch(ferror.trip(reject))
        })
    }
    
    /**
     * Removes the given payment method from the outlet
     */
    removeMethod(user_model, payment_id, trx) {
        return new Promise((resolve, reject) => {
            let outlet_model = user_model.related('outlet');
            if (!outlet_model.has('stripe_customer_id')) {
                return reject(ferror(ferror.FAILED_REQUEST).msg('Outlet is missing payment information'))
            }

            new OutletPayment({ id: payment_id })
                .fetch({
                    require: true,
                    transacting: trx
                })
                .then(payment => {
                    let source_id = payment.get('stripe_source_id')
                    payment
                        .destroy({ transacting: trx })
                        .then(result => deleteStripe(source_id))
                        .catch(ferror.constraint(reject))
                })
                .catch(OutletPayment.NotFoundError, ferror(ferror.INVALID_REQUEST).msg('Payment method not found').trip(reject))
                .catch(ferror.constraint(reject));

            function deleteStripe(source_id) {
                stripe.customers.deleteSource(
                    outlet_model.get('stripe_customer_id'),
                    source_id,
                    (err, confirmation) => {
                        if (err) reject(ferror.stripe(err))
                        else if (!confirmation.deleted) reject(ferror(ferror.FAILED_REQUEST).msg('Failed to delete payment method'))
                        else updateDefaultMethod()
                    }
                )
            }

            function updateDefaultMethod() {
                stripe.customers.retrieve(
                    outlet_model.get('stripe_customer_id'),
                    (err, customer) => {
                        if (err) {
                            reject(ferror.stripe(err))
                        } else {
                            if (!customer.default_source) {
                                done()
                            } else {
                                OutletPayment
                                    .where('stripe_source_id', customer.default_source)
                                    .save({ active: true }, { patch: true, transacting: trx })
                                    .then(done)
                                    .catch(ferror.constraint(reject))
                            }
                        }
                    }
                )
            }

            function done() {
                resolve({ result: 'ok' })
            }
        })
    }

    setActiveMethod(user_model, payment_id, trx) {
        return OutletPayment
            .where('outlet_id', user_model.related('outlet').get('id'))
            .save({ active: false }, { patch: true, transacting: trx })
            .then(() =>
                OutletPayment
                    .forge({ id: payment_id })
                    .fetch({
                        columns: OutletPayment.FILTERS.PUBLIC,
                        require: true,
                        transacting: trx
                    })
                    .catch(OutletPayment.NotFoundError, () =>
                        Promise.reject(ferror(ferror.NOT_FOUND).msg('Payment method not found'))
                    )
                    .then(payment_model => 
                        payment_model
                            .save({ active: true }, { patch: true, transacting: trx })
                            .then(() => new Promise((yes, no) => {
                                stripe.customers.update(
                                    user_model.related('outlet').get('stripe_customer_id'),
                                    { default_source: payment_model.get('stripe_source_id') },
                                    (err, customer) => {
                                        if (err) no(ferror.stripe(err))
                                        else yes(payment_model)
                                    }
                                )
                            }))
                    )
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
        
    /**
     * // TODO hard to implement transactions here
     * Updates the outlet's payment info, returning the result
     * 
     * @param {bookshelf.Model} outlet_model    Outlet model with updated information 
     */
    updateInfo(outlet_model, _trx) {
        return new Promise((resolve, reject) => {
            if (!outlet_model.has('stripe_customer_id')) {
                return reject(ferror(ferror.FAILED_REQUEST).msg('Outlet is missing payment information'))
            }
            
            const params = { description: outlet_model.get('title') }

            stripe.customers.update(outlet_model.get('stripe_customer_id'), params, (err, customer) => {
                if (err) {
                    return reject(ferror(err).type(ferror.API))
                }
                    
                // Change the stripe description (outlet title) back to the previous value rollback
                if (_trx) {
                    _trx.__rollback = _trx.rollback
                    _trx.rollback = () => {
                        stripe.customers.update(
                            outlet_model.get('stripe_customer_id'), 
                            { 
                                description: outlet_model.previous('title') 
                            }, 
                            err => {
                                if (err) {
                                    reporter.report(err)
                                }
                            }
                        );
                        _trx.__rollback()
                    }
                }

                resolve(outlet_model)
            });
        });
    }
}

module.exports = new PaymentController

const NotificationController = require('../Notification')