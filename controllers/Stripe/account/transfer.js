'use strict'

const config = require('../../../config')

const Promise = require('bluebird')

const ferror = require('../../../lib/frescoerror')
const hashids = require('../../../lib/hashids')
const stripe = require('../../../lib/stripe')

const User = require('../../../models/user')
const Purchase = require('../../../models/user_payment')

class StripeTransferController {

	failed(transfer, trx) {
		if (transfer.destination.substr(0, 5) === 'acct_') {
			return User
				.where('stripe_account_id', transfer.destination)
				.fetch({
					require: true,
					withRelated: ['active_payment'],
					transacting: trx
				})
				.catch(User.NotFoundError, err => Promise.reject(ferror(err).type(ferror.NOT_FOUND)))
				.then(user_model => NotificationController.notify({
					recipients: { users: user_model },
					payload: {
						fresco: {
							title: `Our payment to ${user_model.related('active_payment').getName()} was declined. Please reenter your payment info.`,
							meta: {
								payment_id: user_model.related('active_payment').get('id')
							}
						},
						push: {
							title: `Our payment to ${user_model.related('active_payment').getName()} was declined. Please reenter your payment info.`,
							data: {
								payment_id: hashids.encode(user_model.related('active_payment').get('id'))
							}
						}
					}
				}))
				.catch(err => Promise.reject(ferror.constraint(err)))
		} else {
			return Promise.resolve('Transfer not to or from Connect account')
		}
	}
}

module.exports = new StripeTransferController

const NotificationController = require('../../Notification')