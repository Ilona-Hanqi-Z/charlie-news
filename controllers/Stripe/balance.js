'use strict'

const config = require('../../config')
const utils = require('../../utils')

const assert = require('assert')
const Promise = require('bluebird')

const ferror = require('../../lib/frescoerror')
const hashids = require('../../lib/hashids')
const stripe = require('../../lib/stripe')

const Purchase = require('../../models/purchase')
const User = require('../../models/user')

class StripeBalanceController {

	// TODO support for multiple currencies
	available(balance, trx) {
		balance.available = balance.available.find(b => b.currency === 'usd')
		if (!balance.available) return Promise.resolve('No balance available in currency "usd"')
		let amount = balance.available.amount
		amount *= 0.65 // Only withdraw 65% to allow there to remain
		// in the account for sending to users upon stripe account creation
		if (amount < 50) return Promise.resolve('Not enough funds to transfer, post-reduction')

		stripe.transfers.create({
			amount,
			currency: 'usd',
			destination: 'default_for_currency'
		}, (err, transfer) => {
			if (err) reject(ferror.stripe(err))
			else resolve(transfer)
		});
	}

	retrieve(stripe_account) {
		return new Promise((yes, no) => {
			stripe.balance.retrieve({ stripe_account }, (err, balance) => {
				if (err) no(ferror.stripe(err))
				else yes(balance)
			})
		})
	}
}

module.exports = new StripeBalanceController