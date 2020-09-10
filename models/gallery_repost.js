'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'gallery_id',
    'user_id',
    'created_at'
);

module.exports = bookshelf.model('GalleryRepost', ...Base({
    tableName: 'gallery_reposts',
    objectName: 'repost',
    idAttribute: 'id',

    user: function() { return this.belongsTo('User', 'user_id') },
    gallery: function() { return this.belongsTo('Gallery', 'gallery_id') }
}, {
    COLUMNS: COLUMNS
}));