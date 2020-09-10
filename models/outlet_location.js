'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');

const GeoBase = require('./geo_base');
    
const COLUMNS = Columns(
    'id',
    'outlet_id',
    'title',
    'location',
    'send_email_default',
    'send_sms_default',
    'send_fresco_default',
    'send_push_default',
    'created_at'
);

module.exports = bookshelf.model('OutletLocation', ...GeoBase({
    tableName: 'outlet_locations',

    outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },
    settings: function() { return this.hasOne('OutletLocationNotificationSettings', 'location_id'); }
}, {
    GEO_COLUMNS: COLUMNS.with('location'),
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.with('id', 'title', 'location', 'send_email_default', 'send_sms_default', 'send_fresco_default', 'send_push_default', 'created_at')
    }
}));