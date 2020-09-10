'use strict'

const config = require('../../config')

const Promise = require('bluebird')

const ferror = require('../../lib/frescoerror')
const hashids = require('../../lib/hashids')
const stripe = require('../../lib/stripe')

const Purchase = require('../../models/user_payment')

class StripeChargeController {

    /**
     * Charge a Stripe customer
     * 
     * @param {object} options
     * @param {string} options.customer_id Outlet's customer ID to charge
     * @param {number} options.amount Amount to charge customer, in cents
     * @param {number} [options.application_fee] Amount to take for Fresco out of the transaction, in cents. Only applies when destination account is specified
     * @param {string} [options.currency=usd] Currency for this transaction
     * @param {string} [options.destination] Stripe managed account ID to send payment to. Leave null if payment destination is Fresco News
     * @param {string} [options.description] Description of Stripe charge
     * @param {object} [options.metadata=Object] String-only hash of metadata to attach to Stripe charge
     * 
     * @returns {Promise<stripe.charge>}
     */
    create({ customer, amount, application_fee, currency = 'usd', destination, description, metadata = {} } = {}) {
        let payload = { customer, amount, currency, metadata };

        if (destination != null && application_fee != null) payload.application_fee = application_fee;
        if (destination != null) payload.destination = { account: destination };
        if (description != null) payload.description = description;

        return new Promise((yes, no) => {
            stripe.charges.create(payload, (err, charge) => {
                if (err) {
                    // TODO support responding to rate limits and retrying requests
                    no(
                        (err.type === 'StripeCardError')
                            ? ferror.stripe(err)
                            : ferror(ferror.API).msg(err.message || 'There was an error processing this purchase')
                    )
                } else {
                    yes(charge)
                }
            })
        })
    }

    failed(charge, trx) {
        return Purchase
            .where('stripe_charge_id', charge.id)
            .save({ charge_status: Purchase.STATUS.FAILED }, { patch: true, transacting: trx })
            .then(() => Promise.resolve('OK'))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    succeeded(charge, trx) {
        return Purchase
            .where('stripe_charge_id', charge.id)
            .save({ charge_status: Purchase.STATUS.COMPLETE }, { patch: true, transacting: trx })
            .then(() => Promise.resolve('OK'))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    refuneded(charge, trx) {
        return Purchase
            .where('stripe_charge_id', charge.id)
            .save({ charge_status: Purchase.STATUS.REFUNDED }, { patch: true, transacting: trx })
            .then(() => Promise.resolve('OK'))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
}

module.exports = new StripeChargeController

const NotificationController = require('../Notification')