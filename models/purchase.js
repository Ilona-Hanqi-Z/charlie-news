'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
    
const COLUMNS = Columns(
    'id',
    'assignment_id',
    'outlet_id',
    'post_id',
    'user_id',
    'amount',
    'fee',
    'stripe_charge_id',
    'charge_status',
    'stripe_transfer_id',
    'created_at'
);

module.exports = bookshelf.model('Purchase', ...Base({
    tableName: 'purchases',
    
    assignment: function() { return this.belongsTo('Assignment', 'assignment_id'); },
    outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },
    post: function() { return this.belongsTo('Post', 'post_id'); },
    user: function() { return this.belongsTo('User', 'user_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        SELF: COLUMNS.without('stripe_charge_id', 'stripe_transfer_id')
    },
    STATUS: {
        FAILED: -1,
        PENDING: 0,
        COMPLETE: 1,
        REFUNDED: 2
    }
}));