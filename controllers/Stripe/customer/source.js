'use strict'

const config = require('../../../config')
const utils = require('../../../utils')

const assert = require('assert')
const Promise = require('bluebird')

const ferror = require('../../../lib/frescoerror')
const stripe = require('../../../lib/stripe')
const reporter = require('../../../lib/reporter')

const OutletPayment = require('../../../models/outlet_payment')

class StripeCustomerSourceController {

	updated(source = {}, changed = {}, trx) {
		// Ignore non-bank accounts and updates besides the method status
		if (source.object !== 'bank_account' || !changed.status) return Promise.resolve();
		let is_valid = source.status !== 'errored' && source.status !== 'verification_failed';

		return OutletPayment
			.where('stripe_charge_id', source.id)
			.fetch({
				require: true,
				transacting: trx,
				withRelated: [ 'outlet', 'outlet.members', 'outlet.members.roles' ]
			})
			.then(p => p.save({ valid: is_valid }, { patch: true, transacting: trx }))
			.then(p => {
				if (!is_valid) notify(p)
			})
			.catch(OutletPayment.NotFoundError, () =>
				Promise.reject(ferror(ferror.NOT_FOUND)
					.msg('Outlet payment method not found')
					.param('stripe_charge_id')
					.value(source.id))
			)
			.catch(err => Promise.reject(ferror.constraint(err)));

		function notify(payment_model) {
			let outlet = payment_model.related('outlet');
			let users = outlet.related('members').models.filter(
				m => auth.checkPermission('outlet:payment:update', auth.scopesToRegex(m.scopes()))
			);

			NotificationController
				.notify({
					type: 'outlet-payment-invalid',
					recipients: { users },
					payload: {
						sms: `${outlet.get('title')}'s payment information is invalid. Open ${outlet.get('title')}'s settings to update it.`,
						email: {
							subject: 'Invalid payment info',
							title: 'Invalid payment info',
							body: `${outlet.get('title')}'s payment information is invalid. Open <a href="${config.SERVER.WEB_ROOT}outlet/settings">${outlet.get('title')}</a>'s settings to update it.`
						}
					}
				})
				.catch(reporter.report);
		}
	}
}

module.exports = new StripeCustomerSourceController