'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const User = require('./user');
const OutletInvite = require('./outlet_invite');
    
const COLUMNS = Columns(
    'id',
    'owner_id',
    'title',
    'bio',
    'link',
    'avatar',
    'stripe_customer_id',
    'verified',
    'dispatch_enabled',
    'created_at',
    'goal'
);

const Outlet = bookshelf.model('Outlet', ...Base({
    tableName: 'outlets',
    objectName: 'outlet',
    
    invites: function() { return this.hasMany('OutletInvites', 'outlet_id'); },
    locations: function() { return this.hasMany('OutletLocations', 'outlet_id'); },
    owner: function() { return this.belongsTo('User', 'owner_id'); },
    members: function() { return this.hasMany('User', 'outlet_id'); },
    payment_methods: function() { return this.hasMany('OutletPayment', 'outlet_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SELF: COLUMNS.without('stripe_customer_id', '_fts', 'goal'),
        PUBLIC: COLUMNS.without('stripe_customer_id', 'dispatch_enabled', 'created_at', '_fts', 'goal'), // TODO verified? created_at?
        PREVIEW: COLUMNS.with('id', 'title', 'avatar', 'link')
    }
}));

module.exports = Outlet;