'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'user_id',
    'sns_endpoint_arn',
    'app_version',
    'platform',
    'device_token',
    'timezone',
    'locale_identifier',
    'created_at',
    'updated_at'
);

module.exports = bookshelf.model('Installation', ...Base({
    tableName: 'installations',
    
    user: function() { return this.belongsTo('User', 'user_id') },
    subscriptions: function() { return this.hasMany('InstallationSubscription', 'installation_id') }
}, {
    COLUMNS: COLUMNS
}));