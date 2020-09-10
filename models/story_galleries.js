'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'story_id',
    'gallery_id'
);

module.exports = bookshelf.model('StoryGalleries', ...Base({
    tableName: 'story_galleries',
    idAttribute: null
}, {
    COLUMNS: COLUMNS
}));