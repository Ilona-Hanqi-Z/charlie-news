'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'entity',
    'tag',
    'name',
    'scopes'
);

const Role = module.exports = bookshelf.model('Role', ...Base({
    tableName: 'roles',
    objectName: 'role'
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('scopes', 'entity')
    }
}));