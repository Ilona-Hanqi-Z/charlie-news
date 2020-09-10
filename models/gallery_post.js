'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'gallery_id',
    'post_id'
);

module.exports = bookshelf.model('GalleryPost', ...Base({
    tableName: 'gallery_posts',
    idAttribute: null,

    gallery: function() { return this.belongsTo('Gallery', 'gallery_id'); }
}, {
    COLUMNS: COLUMNS
}));