'use strict';

const _ = require('lodash');
const assert = require('assert')
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const stripe = require('../../lib/stripe');
const Promise = require('bluebird');
const Purchase = require('../../models/purchase');
const UserIdentity = require('../../models/user_identity');
const UserPayment = require('../../models/user_payment');

class PaymentController {
    
    /**
     * Create a new managed account object and attach it to the user
     * 
     * NOTE this also creates the user's identity object
     * 
     * @param {bookshelf.model} user_model
     * @param {object}  options
     * @param {string}  options.country    (optional) User's country.  Default 'us'
     * @param {string}  options.currency    (optional) User's default currency code.  Default 'usd'
     * @param {string}  options.account_type (optional) User's Stripe entity type (default 'individual')
     * @param {string}  options.ip_address  (required) User's ip address
     */
    generateManagedAccount(user_model, {
        ip_address,
        currency = 'usd',
        country = 'us',
        account_type = 'individual',
    } = {}, trx) {
        let stripeParams = {
            managed: true,
            country: country.toLowerCase(),
            default_currency: currency.toLowerCase(),
            email: user_model.get('email'),
            legal_entity: {
                type: account_type
            },
            tos_acceptance: {
                date: Math.floor(Date.now() / 1000),
                ip: ip_address
            },
            transfer_schedule: {
                interval: 'daily',
                delay_days: 2
            }
        };
        
        return new Promise((resolve, reject) => {
            stripe.accounts.create(stripeParams, (err, acc) => {
                if (err) {
                    reject(ferror.stripe(err));
                } else {
                    if (trx) {
                        // Hook rolling back stripe into the rollback function for the transaction
                        trx.additional_rollbacks.push(function() {
                            return new Promise((yes, no) => {
                                stripe.accounts.del(acc.id, err => {
                                    if (err) no(err);
                                    else yes();
                                });
                            })
                        })
                    }

                    savePaymentInfo(acc);
                }
            })
            
            function savePaymentInfo(stripe_account) {
                user_model
                    .identity()
                    .save({
                        disabled_reason: stripe_account.verification.disabled_reason,
                        fields_needed: stripe_account.verification.fields_needed.map(UserIdentity.FROM_STRIPE_FIELD).filter(s => !!s),
                        due_by: stripe_account.verification.due_by ? new Date(stripe_account.verification.due_by * 1000) : null
                    }, {
                        patch: true,
                        transacting: trx
                    })
                    .then(() =>
                        user_model
                            .save({
                                stripe_account_id: stripe_account.id,
                                stripe_secret_key: stripe_account.keys.secret,
                                stripe_public_key: stripe_account.keys.publishable,
                                charges_enabled: stripe_account.charges_enabled,
                                transfers_enabled: stripe_account.transfers_enabled
                            }, {
                                patch: true,
                                transacting: trx
                            })
                    )
                    .then(done)
                    .catch(ferror.constraint(reject));
            }

            function done() {
                resolve(user_model)
            }
        });
    }

    /**
     * This function is used to fetch all of the purchases a user
     * earned prior to adding their first payment method, and thus
     * prior to having a Stripe Connect account
     */
    transferPrePayment(user_model, trx) {
        return Purchase
            .query(qb => {
                qb.select(Purchase.knex.raw('stripe_charge_id, ARRAY_AGG(purchases.id) AS ids, SUM(amount - fee) AS total'));
                qb.innerJoin('posts', 'posts.id', 'purchases.post_id')
                qb.where('posts.owner_id', user_model.get('id'));
                qb.groupBy('stripe_charge_id');
            })
            .fetchAll({ transacting: trx })
            .then(coll =>
                //Map through all purchases and create a new transfer for each
                Promise.map(coll.models, model =>
                    xferGroup(model.get('stripe_charge_id'), model.get('ids'), model.get('total'))
                )
            )

        function xferGroup(stripe_charge_id, purchase_ids, total = 0) {

            if (total < 50) return Promise.resolve() // Can't transfer under 50 cents
            return new Promise((yes, no) => {
                stripe.transfers.create({
                    amount: total,
                    currency: 'usd',
                    destination: user_model.get('stripe_account_id'),
                    source_transaction: stripe_charge_id
                }, (err, transfer) => {
                    if (err) return no(err)
                    Purchase
                        .query(qb => qb.whereIn('id', purchase_ids))
                        .save({
                            stripe_transfer_id: transfer.id
                        }, {
                            patch: true,
                            transacting: trx
                        })
                        .then(yes)
                        .catch(ferror.constraint(no))
                });
            });
        }
    }
    
    /**
     * Get the user's saved payment methods
     * 
     * @param {bookshelf.Model} user_model
     * @param {int[]}           _payment_ids (optional)
     * 
     * @returns {bookshelf.Collection}
     */
    listMethods(user_model, _payment_ids) {
        return new Promise((resolve, reject) => {
            UserPayment
                .query(qb => {
                    qb.where('user_id', user_model.get('id'))
                    if (_payment_ids) qb.whereIn('id', _payment_ids)
                    qb.columns(UserPayment.FILTERS.PUBLIC)
                })
                .fetchAll()
                .then(results => resolve(results))
                .catch(ferror.trip(reject))
        })
    }
    
    /**
     * Create a new payment method on this user
     * *Note* — This will check if the user doesn't have a Stripe account first and make one 
     * if so before adding the new payment method
     */
    createMethod(user_model, { token, active, ip_address }, trx) {
        let payment_model = new UserPayment({ user_id: user_model.get('id') })
        let new_stripe_acc = false
        if (!user_model.has('stripe_account_id')) {
            new_stripe_acc = true
        }

        return (new_stripe_acc
            ? this.generateManagedAccount(user_model, { ip_address }, trx)
            : Promise.resolve())
            .then(makeStripePayment)
            .then(source =>
                payment_model
                    .save({
                        stripe_id: source.id,
                        type: source.object,
                        brand: source.brand || source.bank_name,
                        last4: source.last4,
                        active: source.default_for_currency,
                        valid: !(source.status && source.status === 'verification_failed')
                    }, {
                        method: 'insert',
                        transacting: trx
                    })
            )
            .then(() =>
                new_stripe_acc
                    ? this.transferPrePayment(user_model, trx)
                    : Promise.resolve()
            )
            .then(() => Promise.resolve(payment_model.columns(UserPayment.FILTERS.PUBLIC)))

        function makeStripePayment() {
            return new Promise((yes, no) => {
                stripe.accounts.createExternalAccount(
                    user_model.get('stripe_account_id'),
                    {
                        external_account: token,
                        default_for_currency: active || undefined
                    },
                    (err, source) => {
                        if (err) {
                            no(ferror.stripe(err))
                        } else {
                            if (trx) {
                                // Hook rolling back stripe into the rollback function for the transaction
                                trx.additional_rollbacks.push(() => new Promise((yes, no) => {
                                    stripe.accounts.deleteExternalAccount(user_model.get('stripe_account_id'), { external_account: source.id }, err => {
                                        if (err) no(err);
                                        else yes();
                                    });
                                }))
                            }

                            yes(source)
                        }
                    }
                )
            })
        }
    }
    
    /**
     * Removes the given payment method from the user
     */
    removeMethod(user_model, payment_id, trx) {
        return new Promise((resolve, reject) => {
            assert(
                user_model.has('stripe_account_id'), 
                new Error('UserController.Payment#removeMethod called on user without Stripe Connect account')
            );
            
            UserPayment
                .forge({ id: payment_id })
                .fetch({
                    require: true,
                    transacting: trx
                })
                .then(payment => {
                    if (payment.get('active') === true) {
                        return reject(
                            ferror(ferror.INVALID_REQUEST)
                                .msg('You cannot delete the active payment method')
                        );
                    }
                    
                    let stripe_id = payment.get('stripe_id');
                    payment
                        .destroy({ transacting: trx })
                        .then(result => deleteStripe(stripe_id))
                        .catch(ferror.constraint(reject));
                })
                .catch(UserPayment.NotFoundError,
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Payment method does not exist')
                        .trip(reject)
                )
                .catch(ferror.constraint(reject));
                
            function deleteStripe(stripe_id) {
                stripe.accounts.deleteExternalAccount(
                    user_model.get('stripe_account_id'),
                    stripe_id,
                    (err, result) => {
                        if (err) return reject(ferror.stripe(err))
                        else if (!result.deleted) return reject(ferror(err).type(ferror.FAILED_REQUEST).msg('Failed to remove payment method'))
                        else resolve({ success: 'ok' });
                    }
                )
            }
        });
    }
    
    /**
     * Updates the given payment method info on Stripe
     */
    updateMethod(user_model, payment_id, { 
        active, 
        address_city, 
        address_state, 
        address_zip, 
        address_country, 
        address_line1, 
        address_line2, 
        exp_month, 
        exp_year, 
        name 
    } = {}, trx) {
        return new Promise((resolve, reject) => {
            assert(
                user_model.has('stripe_account_id'), 
                new Error('UserController.Payment#updateMethod called on user without Stripe Connect account')
            );
            
            UserPayment
                .forge({ id: payment_id })
                .fetch({
                    require: true,
                    transacting: trx
                })
                .then(updateStripe)
                .catch(UserPayment.NotFoundError,
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Payment method does not exist')
                        .trip(reject)
                )
                .catch(ferror.constraint(reject));
                
            function updateStripe(payment_model) {
                let updates = { default_for_currency: active || undefined }
                
                if (payment_model.get('type') === UserPayment.TYPES.CARD) {
                    updates.address_city = address_city
                    updates.address_country = address_country
                    updates.address_line1 = address_line1
                    updates.address_line2 = address_line2
                    updates.address_state = address_state
                    updates.address_zip = address_zip
                    updates.exp_month = exp_month
                    updates.exp_year = exp_year
                    updates.name = name
                }
                
                stripe.accounts.updateExternalAccount(
                    user_model.get('stripe_account_id'),
                    payment_model.get('stripe_id'),
                    updates,
                    (err, result) => {
                        if (err) return reject(ferror.stripe(err))
                        else if (updates.default_for_currency !== undefined) updateDefault(payment_model, updates.default_for_currency)
                        else resolve(payment_model.columns(UserPayment.FILTERS.PUBLIC))
                    }
                )
            }
            
            function updateDefault(payment_model, _default) {
                payment_model
                    .save({ active: _default }, { patch: true, transacting: trx })
                    .then(result => resolve(result.columns(UserPayment.FILTERS.PUBLIC)))
                    .catch(ferror.constraint(reject));
            }
        });
    }
}

module.exports = new PaymentController;