'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');
const utils = require('../utils');

const COLUMNS = Columns(
    'id',
    'outlet_id',
    'tag',
    'created_at'
);

const ClientFamily = module.exports = bookshelf.model('ClientFamily', ...Base({
    tableName: 'oauth_client_families',
    objectName: 'client_family',

    clients() { return this.hasMany('Client', 'family_id'); },
    outlet() { return this.belongsTo('Outlet', 'outlet_id'); }
}, {
    COLUMNS: COLUMNS,
	FILTERS: {
		PUBLIC: COLUMNS
	}
}));