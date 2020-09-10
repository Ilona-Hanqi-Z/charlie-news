'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');
const utils = require('../utils');

const COLUMNS = Columns(
    'id',
    'token',
    'user_id',
    'client_id',
    'role_id',
    'redirect_uri',
    'state'
);

const AuthorizationCode = module.exports = bookshelf.model('AuthorizationCode', ...Base({
    tableName: 'oauth_authorization_codes',
    objectName: 'authorization_code',

    client() { return this.belongsTo('Client', 'client_id'); },
    user() { return this.belongsTo('User', 'user_id'); },
    role() { return this.belongsTo('Role', 'role_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('id', 'client_id', 'role_id')
    },

    /**
     * Generates an authorization code, ensuring that it is unique
     * 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    generateCode(trx, __tries = 0) {
        if (__tries >= 10) {
            return Promise.reject(
                ferror(ferror.API)
                    .msg('Error generating authorization code')
            );
        }

        let token = utils.randomString(32);
        return AuthorizationCode
            .where('token', token)
            .fetch({
                require: true,
                transacting: trx
            })
            .then(() => AuthorizationCode.generateCode(trx, ++__tries))
            .catch(AuthorizationCode.NotFoundError, () => token) // If no match found, return the token
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
}));