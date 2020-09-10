'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');

const GeoBase = require('./geo_base');
const User = require('./user');

const knex = bookshelf.knex;
const COLUMNS = Columns(
    'id',
    'owner_id',
    'curator_id',
    'importer_id',
    'external_id',
    'external_url',
    'external_account_id',
    'external_account_name',
    'external_account_username',
    'external_source',
    'editorial_caption',
    'caption',
    'tags',
    'address',
    'location',
    'rating',
    'is_nsfw',
    'archived',
    'created_at',
    'updated_at',
    'highlighted_at'
);

const Gallery = bookshelf.model('Gallery', ...GeoBase({
    tableName: 'galleries',
    objectName: 'gallery',

    owner: function() { return this.belongsTo('User', 'owner_id') },
    curator: function() { return this.belongsTo('User', 'curator_id') },
    importer: function() { return this.belongsTo('User', 'imported_id') },
    posts: function() { return this.belongsToMany('Post', 'gallery_posts', 'gallery_id', 'post_id')},
    likes: function() { return this.belongsToMany('Like', 'gallery_likes', 'gallery_id', 'user_id') },
    articles: function() { return this.belongsToMany('Article', 'gallery_articles', 'gallery_id', 'article_id') },
    stories: function() { return this.belongsToMany('Story', 'story_galleries', 'gallery_id', 'story_id') },
    comments: function() { return this.belongsToMany('Comment', 'gallery_comments', 'gallery_id', 'comment_id'); }
}, {
    MAX_POSTS_LENGTH: 8, // Max number of posts in a gallery
    GEO_COLUMNS: COLUMNS.with('location'),
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('archived'),
        PREVIEW: COLUMNS.with('id', 'owner_id', 'caption', 'tags', 'address', 'external_url', 'external_account_name', 'external_account_username', 'external_account_id', 'external_id', 'external_source', 'is_nsfw')
    },
    QUERIES: {
        // Queries for galleries with at least one visible post
        // Takes into consideration outlet with exclusivity &
        // previous purchases if outlet is provided
        VISIBLE: (qb, options = {}) => {
            let { rating, ratings, min_rating, max_rating } = options
            return qb.where(function() {
                if (rating != null || min_rating != null || max_rating != null || ratings) {
                    this.where(function() {
                        this.where(function() {
                            if (min_rating != null || max_rating != null) {
                                if (min_rating != null) this.where('galleries.rating', '>=', min_rating)
                                if (max_rating != null) this.where('galleries.rating', '<=', max_rating)
                            } else if (ratings) {
                                this.whereIn('galleries.rating', ratings)
                            } else {
                                this.where('galleries.rating', rating)
                            }
                        });
                        if (options.user) this.orWhere('galleries.owner_id', options.user.get('id'));
                    });
                }

                Gallery.QUERIES.ARCHIVED(this, { archived: false });
                Gallery.QUERIES.HAS_CONTENT(this, options);
            });
        },
        ARCHIVED: (qb, { archived = true } = {}) => {
            return qb.where(function() {
                this.where('galleries.archived', archived);
                this.orWhere('galleries.highlighted_at', '<=', knex.raw('CURRENT_TIMESTAMP'));
            });
        },
        HAS_CONTENT: (qb, options = {}) => {
            return qb.whereExists(function() {
                this.select('*');
                this.from('gallery_posts');
                this.innerJoin('posts', 'posts.id', 'gallery_posts.post_id')
                this.where('galleries.id', knex.raw('gallery_posts.gallery_id'));
                Post.QUERIES.VISIBLE(this, Object.assign(options.post_options || options, { user: options.user }));
                this.limit(1);
            });
        },
        IS_SFW: qb => {
            return qb.where('galleries.is_nsfw', false)
        },
        // Fetch all imported content from the account on the specified
        // social platform
        SOCIAL_ACCOUNT_IMPORTS: (qb, { social_source, social_account_id } = {}) => {
            return qb.where(function() {
                this.where('galleries.external_account_id', social_account_id);
                this.where('galleries.external_source', social_source);
            })
        }
    },
    RATING: {
        UNRATED:     0,
        SKIPPED:     1,
        VERIFIED:    2
    }
}));

module.exports = Gallery;

// Models required below export to avoid circular reference
const Post = require('./post');