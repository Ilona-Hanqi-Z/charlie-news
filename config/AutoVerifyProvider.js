'use strict';

const _ = require('lodash');

/**
 * This class is a nconfigurator provider. It exists to cache the IDs of accounts that should be automatically followed
 * by new users.
 */
class AutoVerifyProvider {
    build(config) {
        const knex = require('knex')(config.DB);
        return knex
            .select('id')
            .from('users')
            .where('username', config.APPLICATION.AUTO_VERIFY.USERNAME)
            .then(rows => {
                if (rows.length) {
                    config.APPLICATION.AUTO_VERIFY.ID = rows[0].id;
                }
                return config;
            });

    }
}

module.exports = AutoVerifyProvider;