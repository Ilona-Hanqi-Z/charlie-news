'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');
const utils = require('../utils');

const COLUMNS = Columns(
    'id',
    'role_id',
    'client_id',
    'user_id',
    'token',
    'refresh_token',
    'expires_at',
    'created_at'
);

const AccessToken = module.exports = bookshelf.model('AccessToken', ...Base({
    tableName: 'oauth_access_tokens',
    objectName: 'access_token',

    client() { return this.belongsTo('Client', 'client_id'); },
    user() { return this.belongsTo('User', 'user_id'); },
    role() { return this.belongsTo('Role', 'role_id'); },

    /**
     * Checks if this access token has expired
     * 
     * @returns {bool}
     */
    isExpired() {
        return this.has('expires_at') && this.get('expires_at').getTime() < Date.now();
    }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('id', 'client_id', 'role_id'),
        SAFE: COLUMNS.without('token', 'refresh_token')
    },

    /**
     * Generates a bearer token, ensuring that it is unique
     * NOTE: This returns two tokens, the access token and the refresh token
     * 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    generateTokens(trx, __tries = 0) {
        if (__tries >= 10) {
            return Promise.reject(
                ferror(ferror.API)
                    .msg('Error generating access token')
            );
        }

        let access_token = utils.randomString(128);
        let refresh_token = utils.randomString(128);
        return AccessToken
            .query(qb => {
                qb.where('token', access_token).orWhere('refresh_token', refresh_token);
                qb.limit(1);
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(() => AccessToken.generateTokens(trx, ++__tries))
            .catch(AccessToken.NotFoundError, () => [access_token, refresh_token]) // If no match found, return the token
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
}));