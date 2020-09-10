'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'user_id',
    'stripe_id',
    'type',
    'brand',
    'last4',
    'active',
    'valid',
    'never_used',
    'created_at'
);

// TODO Notification to set never_used to true when method is updated
module.exports = bookshelf.model('UserPayment', ...Base({
    tableName: 'user_payment',

    user: function() { return this.belongsTo('User', 'user_id'); },

    getName: function() { return `${this.get('brand')}-${this.get('last4')}` }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('stripe_id', 'never_used')
    },
    TYPES: {
        BANK: 'bank_account',
        CARD: 'card'
    }
}));