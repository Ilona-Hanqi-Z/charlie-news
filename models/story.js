'use strict';

const _ = require('lodash');
const bookshelf = require('../lib/bookshelf');
const ferror = require('../lib/frescoerror');
const knex = bookshelf.knex;
const Columns = require('../lib/columns');
const GeoBase = require('./geo_base');
    
const COLUMNS = Columns(
    'id',
    'curator_id',
    'title',
    'caption',
    'tags',
    'location',
    'created_at',
    'updated_at'
);

const Story = bookshelf.model('Story', ...GeoBase({
    tableName: 'stories',
    objectName: 'story',
    
    curator: function() { return this.belongsTo('User', 'curator_id').query('where', 'active', true) },
    articles: function() { return this.belongsToMany('Article', 'story_articles', 'story_id', 'article_id'); },
    galleries: function() { return this.belongsToMany('Gallery', 'story_galleries', 'story_id', 'gallery_id'); },
    comments: function() { return this.belongsToMany('Comment', 'story_comments', 'story_id', 'comment_id'); },
}, {
    GEO_COLUMNS: COLUMNS.with('location'),
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS,
        PREVIEW: COLUMNS.with('id', 'title', 'caption', 'created_at', 'updated_at')
    },
    QUERIES: {
        VISIBLE: (qb, { user, outlet } = {}) => {
            return qb.whereExists(function() {
                this.select('*');
                this.from('story_galleries');
                this.innerJoin('galleries', 'galleries.id', 'story_galleries.gallery_id')
                this.where('stories.id', knex.raw('"story_galleries"."story_id"'));
                Gallery.QUERIES.VISIBLE(this, {
                    user, outlet,
                    min_rating: Gallery.RATING.VERIFIED,
                    status: Post.STATUS.COMPLETE
                });
                this.limit(1);
            });
        }
    }
}));

module.exports = Story;

const Gallery = require('./gallery');
const Post = require('./post');