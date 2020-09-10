'use strict';

const _ = require('lodash');

const ferror = require('../lib/frescoerror');

const FollowingUsers = require('../models/following_users');
const Gallery = require('../models/gallery');
const Post = require('../models/post');
const Story = require('../models/story');
const User = require('../models/user');

class FeedsController {

    /**
     * Gets galleries + stories feed from users passed user is following.
     *
     * @param user_model
     * @param user_id
     * @param options
     * @param options.sortBy
     * @param options.direction
     * @param options.last
     * @param options.limit
     */
    following(user_model, user_id, { sortBy = 'created_at', direction = 'desc', last, limit = 20 } = {}) {
        if (!user_id) {
            if (user_model) user_id = user_model.get('id');
            else {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST).msg('Missing user! Please specify a user or make this requested as an authenticaded user.')
                );
            }
        }
        if (sortBy !== 'created_at') {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .param('sortBy')
                    .value(sortBy)
                    .msg('Must sort by `created_at` on pagination')
            );
        }

        let self = this, content = [];

        return FollowingUsers
                .query(qb => {
                    qb.rightJoin('users', 'users.id', 'following_users.other_id');
                    qb.where('user_id', user_id);
                    qb.where('following_users.active', true);
                    User.QUERIES.ACTIVE(qb);
                    User.QUERIES.BLOCKING_FILTER(qb, { user: user_model });
                })
                .fetchAll()
                .then(users => fetch(users.models.map(u => u.get('other_id'))))
                .then(query)
                .then(done);

        function fetch(following_ids) {
            return new Promise((resolve, reject) => {
                let q = Gallery.knex
                    .select([
                        'id',
                        Gallery.knex.raw(`array_agg(json_build_object('source', source, 'user_id', user_id, 'username', source_name)) as sources`),
                        'type',
                        Gallery.knex.raw(`MIN(created_at) as created_at`)
                    ])
                    .from(Gallery.knex.raw(`(
                        (${
                            Gallery.knex('galleries')
                                .select(
                                    'galleries.id',
                                    'owner_id as user_id',
                                    'users.username as source_name',
                                    Gallery.knex.raw(`'owner' as source`),
                                    Gallery.knex.raw(`'gallery' as type`),
                                    'galleries.created_at'
                                )
                                .leftJoin('users', 'users.id', 'owner_id')
                                .whereIn('owner_id', following_ids)
                                .where(qb => Gallery.QUERIES.VISIBLE(qb, {
                                    user: user_model,
                                    post_options: {
                                        status: Post.STATUS.COMPLETE
                                    }
                                }))
                        })
                        UNION
                        (${
                            Gallery.knex('gallery_reposts')
                                .select(
                                    'gallery_id as id',
                                    'user_id',
                                    'users.username as source_name',
                                    Gallery.knex.raw(`'repost' as source`),
                                    Gallery.knex.raw(`'gallery' as type`),
                                    'gallery_reposts.created_at'
                                )
                                .leftJoin('users', 'users.id', 'user_id')
                                .leftJoin('galleries', 'galleries.id', 'gallery_id')
                                .whereIn('user_id', following_ids)
                                .where(qb => User.QUERIES.BLOCKING_FILTER(qb, { user: user_model, column: 'galleries.owner_id' }))
                        })
                        UNION
                        (${
                            Gallery.knex('story_reposts')
                                .select(
                                    'story_id as id',
                                    'user_id',
                                    'users.username as source_name',
                                    Gallery.knex.raw(`'repost' as source`),
                                    Gallery.knex.raw(`'story' as type`),
                                    'story_reposts.created_at'
                                )
                                .leftJoin('users', 'users.id', 'user_id')
                                .whereIn('user_id', following_ids)
                        })
                    ) AS user_feed`));

                q.groupBy('id', 'type');
                q.orderBy(sortBy, direction).limit(limit);

                if (last) {
                    q.where(sortBy, direction === 'desc' ? '<' : '>', last);
                }

                q
                    .then(resolve)
                    .catch(e => {
                        if (e.routine === 'DateTimeParseError') return reject(ferror(ferror.INVALID_REQUEST).msg('Invalid timestamp specified!'));
                        else reject(ferror.constraint(e));
                    });
            });
        }

        function query(feed) {
            let gallery_ids = [], story_ids = [];

            for(let l of feed) {
                content.push(l);
                if (l.type === 'gallery') {
                    gallery_ids.push(l.id);
                } else {
                    story_ids.push(l.id);
                }
            }

            return Promise.all([
                self.queryGalleries(user_model, gallery_ids),
                self.queryStories(user_model, story_ids)
            ]);
        }

        function done(feed) {
            return new Promise((resolve, reject) => {
                let _feed = { gallery: {}, story: {}};

                for(let g of feed[0]) {
                    _feed.gallery[g.get('id')] = g;
                }

                for(let s of feed[1]) {
                    _feed.story[s.get('id')] = s;
                }

                resolve(content.map(l => {
                    let obj = _.cloneDeep(_feed[l.type][l.id]);

                    // Was not found
                    if (!obj) return;

                    for(let source of l.sources) {
                        if (source.source === 'repost') {
                            obj.set('reposted_by', source.username);
                        }
                    }

                    obj.set('sources', l.sources);
                    obj.set('action_at', l.created_at);

                    return obj;
                }).filter(c => !!c));
            });
        }
    }

    /**
     * Gets liked galleries + stories feed from passed user
     *
     * NOTE: Will NOT return models, only JSON.
     *
     * @param user_id
     * @param user_model
     * @param options
     * @param options.sortBy
     * @param options.direction
     * @param options.last
     * @param options.limit
     */
    likes(user_model, user_id, { sortBy = 'created_at', direction = 'desc', last, limit = 20 } = {}) {
        return new Promise((resolve, reject) => {
            if (!user_id) {
                if (!user_model) return reject(ferror(ferror.INVALID_REQUEST).msg('Missing user'));
                else user_id = user_model.get('id');
            }

            let self = this, likes = [];

            let qb = Gallery.knex
                .select('id', 'type', 'created_at')
                .from(function() {
                    this
                        .select(
                            'gallery_id AS id',
                            Gallery.knex.raw(`'gallery' as type`),
                            'gallery_likes.action_at AS created_at'
                        )
                        .from('gallery_likes')
                        .where('user_id', user_id)
                        .innerJoin('galleries', 'galleries.id', 'gallery_likes.gallery_id')
                        .leftJoin('users', 'galleries.owner_id', 'users.id');

                    User.QUERIES.ACTIVE(this);

                    this
                        .union(function () {
                            this
                                .select(
                                    'story_id as id',
                                    Gallery.knex.raw(`'story' as type`),
                                    'created_at'
                                )
                                .from('story_likes')
                                .where('user_id', user_id);
                        })
                        .as('likes_feed');
                })
                .orderBy(sortBy, direction)
                .limit(limit);

            if (last) {
                qb.where(sortBy, (direction === 'desc' ? '<' : '>'), last);
            }

            qb.then(query).then(done).catch(ferror.constraint(reject));

            function query(_likes) {
                let gallery_ids = [], story_ids = [];

                for (let l of _likes) {
                    likes.push(l);
                    if (l.type === 'gallery') {
                        gallery_ids.push(l.id);
                    } else {
                        story_ids.push(l.id);
                    }
                }

                return Promise.all([
                    self.queryGalleries(user_model, gallery_ids),
                    self.queryStories(user_model, story_ids)
                ]);
            }

            function done(feed) {
                let _feed = { gallery: {}, story: {}};

                for(let g of feed[0]) {
                    _feed.gallery[g.get('id')] = g;
                }
                
                for(let s of feed[1]) {
                    _feed.story[s.get('id')] = s;
                }
                
                resolve(likes.map(l => {
                    let obj = _feed[l.type][l.id];
                    if (!obj) return null;
                    obj.set('action_at', l.created_at);
                    return obj;
                }).filter(l => l != null));
            }
        });
    }

    /**
     * Gets user's galleries
     *
     * @param user_model
     * @param user_id - id of user feed to fetch
     * @param options
     * @param options.sortBy,
     * @param options.direction
     * @param options.last
     * @param options.limit
     */

    user(user_model, user_id, { sortBy = 'created_at', direction = 'desc', last, limit = 20 } = {}) {
        let self = this;

        return new Promise((resolve, reject) => {
            if (!user_id) {
                if (!user_model) return reject(ferror(ferror.INVALID_REQUEST).msg('Missing user'));
                else user_id = user_model.get('id');
            }

            let content = [];

            let q = Gallery.knex
                        .select([
                            'id',
                            Gallery.knex.raw(`array_agg(json_build_object('source', source, 'user_id', user_id, 'username', source_name)) as sources`),
                            'type',
                            Gallery.knex.raw(`MIN(created_at) as created_at`)
                        ])
                        .from(function() {
                            this
                                .select(
                                    'galleries.id',
                                    'owner_id as user_id',
                                    'users.username as source_name',
                                    Gallery.knex.raw(`'owner' as source`),
                                    Gallery.knex.raw(`'gallery' as type`),
                                    'galleries.created_at'
                                )
                                .leftJoin('users', 'users.id', 'owner_id')
                                .from('galleries')
                                .where('owner_id', user_id);

                            if (!user_model || (user_model && user_model.get('id') != user_id)) {
                                Gallery.QUERIES.VISIBLE(this, {
                                    user: user_model,
                                    post_options: {
                                        status: Post.STATUS.COMPLETE
                                    }
                                });
                            }

                            this
                                .union(function() {
                                    this
                                        .select(
                                            'gallery_id as id',
                                            'user_id',
                                            'users.username as source_name',
                                            Gallery.knex.raw(`'repost' as source`),
                                            Gallery.knex.raw(`'gallery' as type`),
                                            'gallery_reposts.created_at'
                                        )
                                        .leftJoin('users', 'users.id', 'user_id')
                                        .from('gallery_reposts')
                                        .where('user_id', user_id);
                                });

                            this
                                .union(function() {
                                    this
                                        .select(
                                            'story_id as id',
                                            'user_id',
                                            'users.username as source_name',
                                            Gallery.knex.raw(`'repost' as source`),
                                            Gallery.knex.raw(`'story' as type`),
                                            'story_reposts.created_at'
                                        )
                                        .leftJoin('users', 'users.id', 'user_id')
                                        .from('story_reposts')
                                        .where('user_id', user_id);
                                })
                                .as('user_feed');
                        });

            q
                .groupBy('id', 'type')
                .orderBy(sortBy, direction)
                .limit(limit);

            if (last) {
                q.where(sortBy, direction === 'desc' ? '<' : '>', last);
            }

            q
                .then(query)
                .then(done)
                .catch(e => {
                    if (e.routine === 'DateTimeParseError') reject(ferror(ferror.INVALID_REQUEST).msg('Invalid timestamp specified!'));
                    else reject(ferror.constraint(e));
                });

            function query(feed) {
                let gallery_ids = [], story_ids = [];

                for(let l of feed) {
                    content.push(l);
                    if (l.type === 'gallery') {
                        gallery_ids.push(l.id);
                    } else {
                        story_ids.push(l.id);
                    }
                }
                
                return Promise.all([
                    self.queryGalleries(user_model, gallery_ids),
                    self.queryStories(user_model, story_ids)
                ]);
            }

            function done(feed) {
                let _feed = { gallery: {}, story: {}};

                for(let g of feed[0]) {
                    _feed.gallery[g.get('id')] = g;
                }

                for(let s of feed[1]) {
                    _feed.story[s.get('id')] = s;
                }

                resolve(content.filter(l => _feed[l.type][l.id] !== undefined).map(l => {
                    let obj = _.cloneDeep(_feed[l.type][l.id]);

                    obj.set('sources', l.sources);
                    obj.set('action_at', l.created_at);

                    return obj;
                }));
            }
        });
    }

    /**
     * Builds gallery array
     *
     * Note: Does not care whether visible!
     *
     * @param user_model
     * @param gallery_ids
     * @returns {Promise.<T>}
     */
    queryGalleries(user_model, gallery_ids) {
        return Gallery
            .query(qb => {
                qb.select(Gallery.GEO_FILTERS.PUBLIC);
                qb.whereIn('id', gallery_ids);
                Gallery.QUERIES.VISIBLE(qb, {
                    user: user_model,
                    post_options: {
                        status: Post.STATUS.COMPLETE
                    }
                });
            })
            .fetchAll()
            .then(g_c =>
                GalleryController
                    .build(user_model, g_c.models, {
                        filter: Gallery.FILTERS.PUBLIC,
                        keep_fields: ['reposted_by'],
                        show_owner: true,
                        show_curator: true,
                        show_stories: true,
                        show_articles: true,
                        show_posts: true,
                        show_stats: true
                    })
            );
    }

    queryStories(user_model = null, story_ids) {
        return Story
            .query(qb => {
                qb.select(Story.GEO_FILTERS.PUBLIC);
                qb.whereIn('id', story_ids);
                Story.QUERIES.VISIBLE(qb, { user: user_model });
            })
            .fetchAll()
            .then(s_c => 
                StoryController
                    .build(user_model, s_c.models, {
                        keep_fields: ['reposted_by'],
                        filter: Story.FILTERS.PUBLIC,
                        show_curator: true,
                        show_articles: true,
                        show_thumbs: true,
                        show_stats: true,
                    })
            );
    }
}

module.exports = new FeedsController;

const GalleryController = require('./Gallery');
const StoryController = require('./Story');