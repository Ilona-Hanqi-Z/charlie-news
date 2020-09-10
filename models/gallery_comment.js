'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'gallery_id',
    'comment_id'
);

module.exports = bookshelf.model('GalleryComment', ...Base({
    tableName: 'gallery_comments',
    idAttribute: null,

    comment: function() { return this.belongsTo('Comment', 'comment_id'); },
    gallery: function() { return this.belongsTo('Gallery', 'gallery_id'); }
}, {
    COLUMNS: COLUMNS
}));