'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'user_id',
    'report_id'
);

module.exports = bookshelf.model('UserReport', ...Base({
    tableName: 'user_reports',
    idAttribue: null,

    report: function() { return this.belongsTo('Report', 'report_id'); },
    user: function() { return this.belongsTo('User', 'user_id'); }
}, {
    COLUMNS: COLUMNS
}));