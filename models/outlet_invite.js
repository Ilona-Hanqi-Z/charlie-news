'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'outlet_id',
    'user_id',
    'email',
    'token',
    'scopes',
    'expires_at',
    'used',
    'created_at'
);

module.exports = bookshelf.model('OutletInvites', ...Base({
    tableName: 'outlet_invites',
    idAttribute: 'token',
    initialize: function() {
        this.on('fetched', this.build);
    },

    build(model, columns, options) {
        const expired = Date() > model.get('expires_at');

        model.set('status', model.get('used') ? 'used' : expired ? 'expired' : 'pending');
    },

    outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },
    user: function() { return this.belongsTo('User', 'user_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.with('token', 'email'),
    }
}));