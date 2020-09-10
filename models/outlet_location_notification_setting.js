'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');

const Base = require('./base');
    
const COLUMNS = Columns(
    'location_id',
    'user_id',
    'send_email',
    'send_sms',
    'send_fresco',
    'send_push'
);

module.exports = bookshelf.model('OutletLocationNotificationSettings', ...Base({
    tableName: 'outlet_location_notification_settings',
    idAttribute: null,

    location: function() { return this.belongsTo('OutletLocation', 'location_id'); },
    user: function() { return this.belongsTo('User', 'user_id'); },
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SETTINGS: COLUMNS.with('send_email', 'send_fresco', 'send_push', 'send_sms')
    }
}));