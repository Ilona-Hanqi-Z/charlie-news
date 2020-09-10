'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'gallery_id',
    'user_id',
    'active',
    'action_at'
);

module.exports = bookshelf.model('GalleryLike', ...Base({
    tableName: 'gallery_likes',
    objectName: 'like',
    idAttribute: null,
    
    user: function() { return this.belongsTo('User', 'user_id') }
}, {
    COLUMNS: COLUMNS
}));