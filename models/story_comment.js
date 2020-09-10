'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'story_id',
    'comment_id'
);

module.exports = bookshelf.model('StoryComment', ...Base({
    tableName: 'story_comments',
    idAttribute: null,

    comment: function() { return this.belongsTo('Comment', 'comment_id'); },
    story: function() { return this.belongsTo('Story', 'story_id'); }
}, {
    COLUMNS: COLUMNS
}));