'use strict';

const _ = require('lodash');
const config = require('../config');
const Promise = require('bluebird');

const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const GeoBase = require('./geo_base');
const User = require('./user');

const knex = bookshelf.knex;

const COLUMNS = Columns(
    'id',
    'parent_id',
    'owner_id',
    'curator_id',
    'outlet_id',
    'assignment_id',
    'exclusive_to',
    'exclusive_until',
    'job_id',
    'image',
    'video',
    'stream',
    'duration',
    'location',
    'address',
    'width',
    'height',
    'raw',
    'license',
    'status',
    'rating',
    'is_nsfw',
    'archived',
    'created_at',
    'captured_at',
    'updated_at'
);

const Post = bookshelf.model('Post', ...GeoBase({
    tableName: 'posts',
    objectName: 'post',

    assignment: function() { return this.belongsTo('Assignment', 'assignment_id'); },
    first_look_outlet: function() { return this.belongsTo('Outlet', 'outlet_id'); },
    parent: function() { return this.belongsTo('Gallery', 'parent_id'); },
    galleries: function() { return this.belongsToMany('Gallery', 'gallery_posts', 'post_id', 'gallery_id')},
    purchases: function() { return this.hasMany('Purchase', 'post_id'); },
    owner: function() { return this.belongsTo('User', 'owner_id'); },
    curator: function() { return this.belongsTo('User', 'curator_id'); }
}, {
    GEO_COLUMNS: COLUMNS.with('location'),
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('archived', 'job_id', 'raw'),
        THUMBNAIL: COLUMNS.with('id', 'image', 'stream', 'height', 'width', 'duration', 'is_nsfw', 'exclusive_to', 'exclusive_until')
    },
    QUERIES: {
        VISIBLE: (qb, {
            user,
            outlet,

            min_rating,
            max_rating,
            rating,
            ratings,
            min_status,
            max_status,
            status,
            statuses,
            nsfw = true
        } = {}) => {
            let isAdmin = user ? user.can('admin', 'get', 'post') : false;

            return qb.where(function() {
                if (rating != null || min_rating != null || max_rating != null || ratings) {
                    this.where(function() {
                        this.where(function() {
                            if (min_rating != null || max_rating != null) {
                                if (min_rating != null) this.where('posts.rating', '>=', min_rating)
                                if (max_rating != null) this.where('posts.rating', '<=', max_rating)
                            } else if (ratings) {
                                this.whereIn('posts.rating', ratings)
                            } else {
                                this.where('posts.rating', Math.min(rating, Post.RATING.VERIFIED))
                            }
                        });
                        if (user) this.orWhere('posts.owner_id', user.get('id'));
                    });
                }
                if (status != null || min_status != null || max_status != null || statuses) {
                    this.where(function() {
                        this.where(function() {
                            if (min_status != null || max_status != null) {
                                if (min_status != null) this.where('posts.status', '>=', min_status)
                                if (max_status != null) this.where('posts.status', '<=', max_status)
                            } else if (statuses) {
                                this.whereIn('posts.status', ratings)
                            } else {
                                this.where('posts.status', status)
                            }
                        });
                        if (user) this.orWhere(function() {
                            this.where('posts.owner_id', user.get('id'))
                            this.where('posts.status', '>=', Post.STATUS.PROCESSING)
                        });
                    });
                }

                if (!nsfw) Post.QUERIES.IS_SFW(this)
                if (!isAdmin) {
                    if (outlet || user) {
                        Post.QUERIES.ARCHIVED(this, { user, outlet });
                        Post.QUERIES.EXCLUSIVITY(this, { user, outlet });
                    }

                    Post.QUERIES.FIRST_LOOK(this, { user, outlet });
                    Post.QUERIES.CHECK_ACTIVE_ASSIGNMENT(this, { user, outlet });
                }
            });
        },
        ARCHIVED: (qb, { user, outlet } = {}) => {
            if (!outlet && user) outlet = user.related('outlet');
            return qb.where(function() {
                this.where('posts.archived', false);
                if (outlet && !outlet.isNew()) {
                    this.orWhereExists(function() {
                        this.from('purchases');
                        this.where('purchases.outlet_id', outlet.get('id'));
                        this.andWhere('purchases.post_id', knex.raw('??', ['posts.id']));
                    });
                }
            });
        },
        /**
         * Alters query to hide posts which are part of active assignments, unless the requesting
         * entity is associated with said assignment.
         * 
         * NOTE does not take into account admin status, must be done wherever it is used
         * 
         * @param {knex.QueryBuilder} qb query builder on which to apply the condition
         * @param {object} context
         * @param {bookshelf.Model} [context.user] the user making the request
         * @param {bookshelf.Model} [context.outlet] the outlet making the request
         * 
         * @returns {knex.QueryBuilder}
         */
        CHECK_ACTIVE_ASSIGNMENT: (qb, { user, outlet } = {}) => {
            if (!outlet && user) outlet = user.related('outlet');

            // skip check for app users
            if (!outlet || outlet.isNew()) return qb;

            return qb.where(function() {
                this.whereNull('posts.assignment_id');
                if (user && !user.isNew()) this.orWhere('posts.owner_id', user.get('id'));
                this.orWhereExists(function() {
                    this.select('*')
                    this.from('assignments')
                    if (outlet.get('id')) this.innerJoin('assignment_outlets', 'assignments.id', 'assignment_outlets.assignment_id');
                    this.where('assignments.id', knex.raw('posts.assignment_id'))
                    this.where(function() {
                        this.where(function() {
                            this.where('assignments.starts_at', '>', knex.raw('CURRENT_TIMESTAMP'));
                            this.orWhere('assignments.ends_at', '<', knex.raw('CURRENT_TIMESTAMP'));
                        });
                        if (outlet.get('id')) {
                            this.orWhere('assignment_outlets.outlet_id', outlet.get('id'));
                        }
                    });
                });
            });
        },
        /**
         * Alters query to hide posts which other outlets have first look rights to
         * 
         * NOTE does not take into account admin status, must be done wherever it is used
         * 
         * @param {knex.QueryBuilder} qb query builder on which to apply the condition
         * @param {object} context
         * @param {bookshelf.Model} [context.user] the user making the request
         * @param {bookshelf.Model} [context.outlet] the outlet making the request
         * 
         * @returns {knex.QueryBuilder}
         */
        FIRST_LOOK: (qb, { user, outlet } = {}) => {
            if (!outlet && user) outlet = user.related('outlet');

            // skip for app users
            if (!outlet || outlet.isNew()) return qb;

            return qb.where(function() {
                this.whereNull('posts.outlet_id');
                if (outlet && !outlet.isNew()) this.orWhere('posts.outlet_id', outlet.get('id'));
                this.orWhere('posts.created_at', '<=', knex.raw(`CURRENT_TIMESTAMP - INTERVAL '${config.APPLICATION.DELAYS.HAS_FIRST_LOOK} MILLISECONDS'`));
                if (user && !user.isNew()) this.orWhere('posts.owner_id', user.get('id'));
            });
        },
        EXCLUSIVITY: (qb, { user, outlet } = {}) => {
            // Registered app users can see exclusively bought content
            if (!outlet && user && !user.isNew()) outlet = user.related('outlet');
            
            // skip for app users
            if (!outlet || outlet.isNew()) return qb;
            
            // NOTE if exclusive_to is set and exclusive_until is not, exclusivity is permanent
            return qb.where(function() {
                this.whereNull('posts.exclusive_to');
                this.orWhere('posts.exclusive_to', outlet.get('id'));
                this.orWhere('posts.exclusive_until', '<', Post.knex.raw('CURRENT_TIMESTAMP'));
                this.orWhereExists(function() {
                    this.select('*');
                    this.from('purchases');
                    this.where('outlet_id', outlet.get('id'));
                    this.where('post_id', Post.knex.raw('posts.id'));
                });
            });
        },
        IS_SFW: qb => {
            return qb.where('posts.is_nsfw', false)
        },
        PURCHASED: (qb, { user, outlet } = {}) => {
            if (!outlet && user) outlet = user.related('outlet');
            if (!outlet || outlet.isNew()) return qb;
            return qb.select(knex.raw(
                '(SELECT CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END FROM ?? WHERE ?? = ? AND ?? = "posts"."id") AS ??',
                ['purchases', 'purchases.outlet_id', outlet.get('id'), 'purchases.post_id', 'purchased']
            ));
        }
    },
    STATUS: {
        FAILED: -1,
        PENDING: 0,
        PROCESSING: 1,
        COMPLETE: 2
    },
    RATING: {
        UNRATED:     0,
        SKIPPED:     1,
        VERIFIED:    2
    },
    LICENSE: {
        BASIC: 0
    }
}));

module.exports = Post;