'use strict';

const Base = require('./base');

const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id', // id is used to join with subscription_arn
    'user_id',
    'type',
    'options',
    'updated_at'

    // The following are not actually part of the table (they get joined in), but were needed to return info with the model
    // 'title',
    // 'description'
);

module.exports = bookshelf.model('UserSettings', ...Base({
    tableName: 'user_settings',

    subscriptions: function() { return this.hasMany('InstallationSubscription', 'user_setting_id')}
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SELF: COLUMNS.without('id', 'user_id', 'updated_at'),
        FULL: COLUMNS
    }
}));