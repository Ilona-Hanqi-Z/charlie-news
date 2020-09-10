'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'story_id',
    'user_id',
    'created_at'
);

module.exports = bookshelf.model('StoryRepost', ...Base({
    tableName: 'story_reposts',
    idAttribute: null
}, {
    COLUMNS: COLUMNS
}));