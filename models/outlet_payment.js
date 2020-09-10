'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'outlet_id',
    'stripe_source_id',
    'type',
    'brand',
    'last4',
    'active',
    'valid',
    'created_at'
);

module.exports = bookshelf.model('OutletPayment', ...Base({
    tableName: 'outlet_payment',

    outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },

    getName: function() { return `${this.get('brand')}-${this.get('last4')}` }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('stripe_source_id')
    },
    TYPES: {
        BANK: 'bank_account',
        CARD: 'card'
    }
}));