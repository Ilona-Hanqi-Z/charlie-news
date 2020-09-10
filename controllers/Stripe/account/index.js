'use strict'

const _ = require('lodash')
const config = require('../../../config')
const utils = require('../../../utils')

const assert = require('assert')
const Promise = require('bluebird')

const ferror = require('../../../lib/frescoerror')
const stripe = require('../../../lib/stripe')
const reporter = require('../../../lib/reporter');

const User = require('../../../models/user')
const UserIdentity = require('../../../models/user_identity')

class StripeAccountController {

	update(user_model, updates = {}, trx) {
		assert(user_model.has('stripe_account_id'), 'StripeController.account#update: User missing stripe_account_id')
		return new Promise((resolve, reject) => {
			if (Object.keys(updates).length === 0) return resolve()
			stripe.account.update(user_model.get('stripe_account_id'), updates, (err, account) => {
				if (err) return reject(ferror.stripe(err))

				// Update verification status
				user_model
					.save({
						charges_enabled: account.charges_enabled,
						transfers_enabled: account.transfers_enabled
					}, {
						patch: true,
						transacting: trx
					})
					.then(() =>
						user_model
							.identity()
							.importAccountData(account, trx)
					)
					.then(() => resolve(account))
					.catch(ferror.constraint(reject))
			})
		})
	}
	
	updated(account, previous_attributes = {}, trx) {
		if (!previous_attributes.legal_entity && !previous_attributes.verification) {
			return Promise.resolve();
		}

		return User
			.where('stripe_account_id', account.id)
			.fetch({
				require: true,
				transacting: trx
			})
			.catch(User.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('No user found with that stripe account ID')))
			.then(user_model =>
				user_model
					.identity()
					.importAccountData(account, trx)
					.then(() =>
						user_model
							.save({
								charges_enabled: account.charges_enabled,
								transfers_enabled: account.transfers_enabled
							}, {
								patch: true,
								transacting: trx
							})
					)
			)
			.then(notify)
			.catch(err => Promise.reject(ferror.constraint(err)))

		function notify(user_model) {
			if (!_.isObject(previous_attributes.verification)) {
				return Promise.resolve()
			} else if (previous_attributes.verification.due_by === null) {
                let fields_needed = UserIdentity.FROM_STRIPE_FIELDS(account.verification.fields_needed)
                return NotificationController
                    .notify({
                        recipients: {
                            users: user_model
                        },
                        type: 'user-payment-tax-info-required',
                        payload: {
                            fresco: {
                                title: 'Identity Information Requested',
                                body: 'New information is needed to verify your identity. Please update your ID info in settings to continue receiving payments.',
                                meta: {
                                    fields_needed
                                }
                            },
                            push: {
                                title: 'Identity Information Requested',
                                body: 'New information is needed to verify your identity. Please update your ID info in settings to continue receiving payments.',
                                data: { fields_needed }
                            }
                        }
                    })
                    .then(results => Promise.resolve())
                    .catch(reporter.report)
            }
		}
	}
}

module.exports = new StripeAccountController;
module.exports.external_account = require('./external_account');
module.exports.transfer = require('./transfer');

const NotificationController = require('../../Notification');