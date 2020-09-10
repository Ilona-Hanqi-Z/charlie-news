'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const CommentEntity = require('./comment_entity');
const GalleryComment = require('./gallery_comment');
const StoryComment = require('./story_comment');

const COLUMNS = Columns(
    'id',
    'user_id',
    'comment',
    'created_at',
    'updated_at'
);

module.exports = bookshelf.model('Comment', ...Base({
    tableName: 'comments',

    user: function() { return this.belongsTo('User', 'user_id'); },
    entities: function() { return this.hasMany('CommentEntity', 'comment_id') },
    gallery: function() { return this.belongsToMany('Gallery', 'gallery_comments', 'comment_id', 'gallery_id'); },
    story: function() { return this.belongsToMany('Story', 'story_comments', 'comment_id', 'story_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS
    }
}));