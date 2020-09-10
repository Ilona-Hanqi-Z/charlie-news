'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'comment_id',
    'entity_id',
    'entity_type',
    'text',
    'start_index',
    'end_index'
);

module.exports = bookshelf.model('CommentEntity', ...Base({
    tableName: 'comment_entities',

    comment: function() { return this.belongsTo('Comment', 'comment_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS
    }
}));