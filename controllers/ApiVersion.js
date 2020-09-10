'use strict';

const _ = require('lodash');
const ApiVersionModel = require('../models/api_version');
const config = require('../config');
const ferror = require('../lib/frescoerror');
const Promise = require('bluebird');

class ApiVersionController {

	/**
	 * Fetches the newest API version model
	 * 
	 * @param {knex.Transaction} [trx]
	 * 
	 * @returns {Promise<bookshelf.Model>}
	 */
    getCurrent(trx) {
		return ApiVersionModel
			.query(qb => {
				qb.where('is_enabled', true);
				qb.orderBy('version_major', 'desc');
				qb.orderBy('version_minor', 'desc');
				qb.orderBy('version_patch', 'desc');
			})
			.fetch({ transacting: trx })
			.catch(err => Promise.reject(ferror.constraint(err)));
	}

	/**
	 * Fetches all currently supported versions of the API.
	 * 
	 * @param {boolean} [show_hidden=false] if true, will show api versions labeled as hidden
	 * @param {knex.Transaction} [trx]
	 * 
	 * @returns {Promise<bookshelf.Model[]>}
	 */
    getAll(show_hidden = false, trx) {
		return ApiVersionModel
			.query(qb => {
				qb.where('is_enabled', true);
				if (!show_hidden) qb.where('is_public', true);
				qb.orderBy('version_major', 'desc');
				qb.orderBy('version_minor', 'desc');
				qb.orderBy('version_patch', 'desc');
			})
			.fetchAll({ transacting: trx })
			.then(collection => collection.models)
			.catch(err => Promise.reject(ferror.constraint(err)));
	}
};

module.exports = new ApiVersionController;