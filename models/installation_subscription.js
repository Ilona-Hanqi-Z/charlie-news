'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'installation_id',
    'user_setting_id',
    'subscription_arn'
);

module.exports = bookshelf.model('InstallationSubscription', ...Base({
    tableName: 'installation_subscriptions',
    idAttribute: null
}, {
    COLUMNS: COLUMNS
}));