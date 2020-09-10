'use strict'

const config = require('../../config')

const Promise = require('bluebird')

const ferror = require('../../lib/frescoerror')
const stripe = require('../../lib/stripe')

class StripeRefundController {

    /**
     * Refund a Stripe charge
     * 
	 * @param {string} charge Stripe charge ID
     * @param {object} options
	 * @param {number} [options.amount] Amount of the charge to refund, default is entire charge
     * @param {boolean} [options.refund_application_fee] Refund the Fresco application fee associated with this transfer?
     * @param {boolean} [options.reverse_transfer] Reverse the transfer which funded this refund?
     * 
     * @returns {Promise<stripe.refund>}
     */
    create(charge, { amount, refund_application_fee, reverse_transfer } = {}) {
        return new Promise((yes, no) => {
			let options = { charge };

			if (typeof amount === 'number') {
				options.amount = amount;
			}
			if (typeof refund_application_fee === 'boolean') {
				options.refund_application_fee = refund_application_fee;
			}
			if (typeof reverse_transfer === 'boolean') {
				options.reverse_transfer = reverse_transfer;
			}

            stripe.refunds.create(options, (err, refund) => {
                if (err) {
                    // TODO support responding to rate limits and retrying requests
                    no(
                        (err.type === 'StripeCardError')
                            ? ferror.stripe(err)
                            : ferror(ferror.API).msg(err.message || 'There was an error processing this refund')
                    )
                } else {
                    yes(refund)
                }
            })
        })
    }
}

module.exports = new StripeRefundController