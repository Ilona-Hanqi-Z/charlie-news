'use strict'

const config = require('../../../config')

const Promise = require('bluebird')

const ferror = require('../../../lib/frescoerror')
const stripe = require('../../../lib/stripe')

const UserPayment = require('../../../models/user_payment')

const VALID_BANK_STATUSES = ['validated', 'verified']

class StripeExternalAccountController {

	// TODO notify?
	updated(external_account, prev_attrs = {}, trx) {
		let updates = {}

		if (prev_attrs.default_for_currency !== undefined) {
			updates.active = external_account.default_for_currency
		}
		if (prev_attrs.status) { // Bank account only
			updates.valid = VALID_BANK_STATUSES.includes(external_account.status)
		}

		return (Object.keys(updates).length > 0)
				? updateMethod(updates)
				: Promise.resolve()
		
		function updateMethod(updates = {}) {
			return UserPayment
				.where('stripe_id', external_account.id)
				.save(updates, { patch: true, transacting: trx })
				.catch(UserPayment.NoRowsUpdatedError, () => Promise.resolve(null))
				.catch(err => Promise.reject(ferror.constraint(err)))
		}
	}
}

module.exports = new StripeExternalAccountController

const NotificationController = require('../../Notification')
const StripeBalanceController = require('../balance')