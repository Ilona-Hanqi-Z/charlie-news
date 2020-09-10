'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');
const utils = require('../utils');

const COLUMNS = Columns(
    'id',
    'family_id',
    'role_id',
    'outlet_id',
	'api_version_id',
    'client_id',
    'client_secret',
    'redirect_uri',
    'tag',
	'enabled',
    'last_used_at',
	'created_at'
);

const Client = module.exports = bookshelf.model('Client', ...Base({
    tableName: 'oauth_clients',
    objectName: 'client',

	outlet() { return this.belongsTo('Outlet', 'outlet_id'); },
	api_version() { return this.belongsTo('ApiVersion', 'api_version_id'); },
    role() { return this.belongsTo('Role', 'role_id'); },
    family() { return this.belongsTo('ClientFamily', 'family_id'); },
    access_tokens() { return this.hasMany('AccessToken', 'client_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('client_secret', 'api_version_id', 'role_id' ),
        SAFE: COLUMNS.without('client_secret')
    },

    /**
     * Generates a client ID, ensuring that it is unique
     * 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    generateID(trx, __tries = 0) {
        if (__tries >= 10) {
            return Promise.reject(
                ferror(ferror.API)
                    .msg('Error generating client id')
            );
        }

        let id = utils.randomString(32);
        let secret = utils.randomString(64);
        return Client
            .where('client_id', id)
            .fetch({
                require: true,
                transacting: trx
            })
            .then(() => Client.generateID(trx, ++__tries))
            .catch(Client.NotFoundError, () => id) // If no match found, return the token
            .catch(err => Promise.reject(ferror.constraint(err)))
    },

    /**
     * Generates a random client secret
     * 
     * @returns {string}
     */
    generateSecret() {
        return utils.randomString(64);
    }
}));