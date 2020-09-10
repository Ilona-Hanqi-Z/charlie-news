'use strict';

const _ = require('lodash');

/**
 * This class is a nconfigurator provider. It exists to cache the IDs of accounts that should be automatically followed
 * by new users.
 */
class AutoFollowProvider {
    build(config) {
        const knex = require('knex')(config.DB);
        return knex
            .select('id')
            .from('users')
            .whereIn('username', config.APPLICATION.AUTO_FOLLOW.USERNAMES)
            .then(rows => {
                config.APPLICATION.AUTO_FOLLOW.IDS = _.map(rows, 'id');
                return config;
            });

    }
}

module.exports = AutoFollowProvider;