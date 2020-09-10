'use strict';

const _ = require('lodash');
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const Promise = require('bluebird');
const RoleModel = require('../../models/role');

class RoleController {

    /**
     * Get an array of the roles in the db
     * 
	 * @param {string} [entity] The entity to restrict the role results by
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise<[bookshelf.Model]>}
     */
    getOne(fields = {}, { require = true, trx } = {}) {
        return RoleModel
			.where(fields)
			.fetch({ require, transacting: trx })
            .catch(RoleModel.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Role not found')
                )
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }

    /**
     * Get a role by tag
     * 
	 * @param {string} tag The tag of the role to fetch
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise<bookshelf.Model[]>}
     */
    getMany(fields = {}, { trx } = {}) {
        return RoleModel
			.where(fields)
			.fetchAll({ transacting: trx })
            .then(collection => collection.models)
            .catch(RoleModel.Collection.EmptyError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Role(s) not found')
                )
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }
}

module.exports = new RoleController;