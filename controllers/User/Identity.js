'use strict';

const _ = require('lodash');
const assert = require('assert')
const Promise = require('bluebird');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');

const UserIdentity = require('../../models/user_identity');

class UserIdentityController {

	/**
	 * Create a new identity object for this user.
	 * 
	 * NOTE: This identity must be created blank.
	 * Any updates to identity must go through #update
	 * 
	 * @param user_model {bookshelf.Model}
	 * @param trx {knex.Transaction}
	 * 
	 * @returns {Promise}
	 */
	create(user_model, trx) {
		return user_model
			.identity()
			.save(null, { method: 'insert', transacting: trx })
			.catch(err => Promise.reject(ferror.constraint(err)))
	}

	/**
	 * Updates the user's identity information
	 * 
	 * @param user_model {bookshelf.Model}
	 * @param updates {Object}
	 * @param trx {knex.Transaction} optional
	 * 
	 * @returns {Promise}
	 */
	update(user_model, updates = {}, trx) {
		return user_model
			.identity()
			.fetch({ transacting: trx })
			.then(id_model => {
				for (let key in updates) {
					if (key === 'stripe_pid_token') key = 'personal_id_number'
					if (key === 'stripe_document_token') key = 'id_document'

					if (id_model.has(key) && !id_model.get('fields_needed').includes(key)) {
						return Promise.reject(
							ferror(ferror.FAILED_REQUEST)
								.param(key)
								.msg('This field is locked and cannot be updated until further verification of the field is requested.')
						)
					}
				}

				return StripeController.account
					.update(user_model, UserIdentity.BUILD_STRIPE_UPDATES(updates))
			})
			.then(() =>
				user_model
					.identity()
					.save(
						Object.assign(updates, { updated_at: new Date() }),
						{ patch: true, transacting: trx }
					)
			)
			.catch(err => Promise.reject(ferror.constraint(err)))
	}
}

module.exports = new UserIdentityController;

const StripeController = require('../Stripe')