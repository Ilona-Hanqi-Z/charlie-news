'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../lib/frescoerror');
const knex = require('../lib/bookshelf').knex;

const Comment = require('../models/comment');
const CommentEntity = require('../models/comment_entity');
const Gallery = require('../models/gallery');
const Story = require('../models/story');
const User = require('../models/user');

class CommentController {
    
    /**
     * Format comments for response
     * 
     * @param user_model
     * @param comments
     */
    build(user_model, comments, {
        filter = Comment.FILTERS.PUBLIC,
        keep_fields = [],
        show_user = true,
        show_gallery = true,
        show_story = true,
        show_entities = true,
        show_position = true,

        build_user = {},
        build_gallery = {},
        build_story = {},

        trx
    } = {}) {
        if (!comments) return Promise.resolve();

        let isArr = true;
        if(!_.isArray(comments)) {
            isArr = false;
            comments = [comments];
        }
        if (comments.length === 0) return Promise.resolve(comments);

        // map: Hashmap, hash being the related id, and value being an array of gallery models that share that relationship
        // ids: Array of all gallery ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            comments: { map: {}, ids: [] }, // map: gallery id -> gallery model hashmap, ids = array of all gallery ids
            galleries: { build: [], map: {}, ids: [] },
            stories: { build: [], map: {}, ids: [] },
            users: { build: [], map: {}, ids: [] },
        };

        for (let comment of comments) {
            let _comment_id = comment.get('id');
            let _user_id = comment.get('user_id');
            
            comment.columns(filter.concat(keep_fields));
            comment.trigger('fetched', comment);

            references.comments.ids.push(_comment_id);
            references.comments.map[_comment_id] = comment;

            // NOTE defauls are set below because if comments have no results
            // in the corresponding query, they will not be included in the
            // query results

            if (show_user) {
                if (comment.relations.user) {
                    references.users.build.push(comment.relations.user);
                } else {
                    comment.relations.user = User.nullable();

                    if (_user_id) {
                        if (!references.users.map[_user_id]) {
                            references.users.map[_user_id] = [comment];
                            references.users.ids.push(_user_id);
                        } else {
                            references.users.map[_user_id].push(comment);
                        }
                    }
                }
            } else {
                delete comment.relations.user;
            }
            if (show_story) {
                // Make a default empty array for stories without stories
                if (comment.relations.story) {
                    references.stories.build.push(comment.relations.story);
                } else {
                    comment.relations.story = Story.nullable();
                    references.stories.ids.push(_comment_id);
                }
            } else {
                delete comment.relations.story;
            }
            if (show_gallery) {
                // Make a default empty array for galleries without galleries
                if (comment.relations.gallery) {
                    references.galleries.build.push(comment.relations.gallery);
                } else {
                    comment.relations.gallery = Gallery.nullable();
                    references.galleries.ids.push(_comment_id);
                }
            } else {
                delete comment.relations.gallery;
            }
            if (show_entities) {
                comment.set('entities', []);
            } else {
                comment.unset('entities');
            }
        }

        return Promise
            .all([
                // User promise
                new Promise((yes, no) => {
                    if (!show_user) return yes();

                    User.knex('users')
                        .select(User.FILTERS.PREVIEW)
                        .whereIn('id', references.users.ids)
                        .where(qb => User.QUERIES.ACTIVE(qb))
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _user = User.forge(row);
                                references.users.map[row.id].forEach(comment => comment.relations.user = _user);
                                references.users.build.push(_user);
                            }

                            UserController
                                .build(user_model, references.users.build, Object.assign({
                                    filter: User.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true,
                                    trx
                                }, build_user))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Story promise
                new Promise((yes, no) => {
                    if (!show_story) return yes();

                    Story.knex('stories')
                        .select(...Story.GEO_FILTERS.PUBLIC, 'story_comments.comment_id')
                        .innerJoin('story_comments', 'story_comments.story_id', 'stories.id')
                        .whereIn('story_comments.comment_id', references.comments.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _story = Story.forge(row);
                                references.comments.map[row.comment_id].relations.story = _story;
                                references.stories.build.push(_story);
                            }

                            StoryController
                                .build(user_model, references.stories.build, Object.assign({
                                    filter: Story.FILTERS.PUBLIC,
                                    show_curator: true,
                                    show_articles: true,
                                    show_thumbs: true,
                                    show_stats: true,
                                    trx
                                }, build_story))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Gallery promise
                new Promise((yes, no) => {
                    if (!show_gallery) return yes();

                    Gallery.knex('galleries')
                        .select(...Gallery.GEO_FILTERS.PUBLIC, 'gallery_comments.comment_id')
                        .innerJoin('gallery_comments', 'gallery_comments.gallery_id', 'galleries.id')
                        .whereIn('gallery_comments.comment_id', references.comments.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _gallery = Gallery.forge(row);
                                references.comments.map[row.comment_id].relations.gallery = _gallery;
                                references.galleries.build.push(_gallery);
                            }

                            GalleryController
                                .build(user_model, references.galleries.build, Object.assign({
                                    filter: Gallery.FILTERS.PUBLIC,
                                    show_owner: true,
                                    show_curator: true,
                                    show_stories: true,
                                    show_articles: true,
                                    show_posts: true,
                                    show_stats: true,
                                    trx
                                }, build_gallery))
                                .then(yes)
                                .catch(no);
                        }).catch(no);
                }),
                // Entities promise
                new Promise((yes, no) => {
                    if (!show_entities) return yes();

                    CommentEntity.knex('comment_entities')
                        .select(CommentEntity.FILTERS.PUBLIC)
                        .whereIn('comment_id', references.comments.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.comments.map[row.comment_id].get('entities').push(row);
                            }
                            yes();
                        }).catch(no);
                }),
                // Position promise
                new Promise((yes, no) => {
                    // TODO do this a better way?
                    if (!show_position) return yes();

                    let knex = Comment.knex;
                    knex
                        .select(
                            'positions.position',
                            'positions.comment_id'
                        )
                        .from(function() {
                            this
                                .select()
                                .from('gallery_comments')
                                .whereIn('gallery_comments.comment_id', references.comments.ids)
                                .as('comment_galleries');
                        })
                        .joinRaw(`INNER JOIN LATERAL (
                            SELECT summary.*
                                FROM (
                                SELECT
                                    gallery_comments.*,
                                    row_number() over(ORDER BY comments.created_at) AS position
                                FROM gallery_comments
                                    INNER JOIN comments ON gallery_comments.comment_id = comments.id
                                WHERE gallery_comments.gallery_id = comment_galleries.gallery_id
                                ) summary
                                WHERE summary.comment_id = comment_galleries.comment_id
                            ) positions ON TRUE
                        `)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                references.comments.map[row.comment_id].set('position', parseInt(row.position));
                            }
                            yes();
                        }).catch(no);
                })
            ])
            .then(() => Promise.resolve(isArr ? comments : comments[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    get(ids = [], { user, outlet, trx } = {}) {
        let isArr = _.isArray(ids);
        if (!isArr) {
            ids = [ids];
        }

        return Comment
            .query(qb => {
                qb.select(Comment.FILTERS.PUBLIC)
                qb.whereIn('id', ids);
            })
            .fetchAll({
                require: true,
                transacting: trx
            })
            .then(cs => {
                if (isArr) {
                    return Promise.resolve(cs.models);
                } else if (cs.length) {
                    return Promise.resolve(cs.models[0]);
                } else {
                    return Promise.reject(ferror(ferror.NOT_FOUND));
                }
            })
            .catch(Comment.Collection.EmptyError, err =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND).msg('Comment(s) not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    make(user_model, comment = '', trx) {
        let _this = this;
        return new Promise((resolve, reject) => {
            comment = comment.trim();

            if (!comment) {
                return reject(
                    ferror(ferror.INVALID_REQUEST)
                        .param('comment')
                        .value('')
                        .msg('Comment cannot be empty.')
                );
            }

            let entities = [];
            let user_references = {};
            let comment_model = new Comment({
                comment,
                user_id: user_model.get('id')
            });

            comment_model
                .save(null, { patch: false, method: 'insert', transacting: trx })
                .then(model => model.fetch({ transacting: trx }))
                .then(extractEntities)
                .catch(ferror.constraint(reject));

            function extractEntities(comment_model) {
                comment += ' '; // space padding for capturing entities at end of string
                let entity_type;
                let this_word = '';
                let start_index = -1;

                for (let i = 0; i < comment.length; ++i) {
                    if (this_word !== '') {
                        if (/[0-9a-z_\-]/gi.test(comment[i])) {
                            this_word += comment[i];
                        } else if (/[ .,!;:}\])'"]/g.test(comment[i])) {
                            let _entity = buildEntity(this_word, entity_type, start_index, i - 1);
                            if (entity_type === 'user') user_references[this_word.toLowerCase()] = _entity;
                            entities.push(_entity);
                            this_word = '';
                        } else {
                            this_word = '';
                        }
                    } else if (
                        (comment[i] === '@' || comment[i] === '#') 
                        && (i === 0 || /[ {(["'/\\]/g.test(comment[i - 1]))
                    ) {
                        entity_type = comment[i] === '@' ? 'user' : 'tag';
                        start_index = i;
                        this_word = comment[++i];
                    }
                }

                if (!entities.length) return done();
                else fetchUserEntities(Object.keys(user_references));
            }

            function buildEntity(text, entity_type, start_index, end_index) {
                return { text, entity_type, start_index, end_index, comment_id: comment_model.get('id'), entity_id: null };
            }

            function fetchUserEntities(usernames) {
                if (!usernames.length) return done();

                User
                    .query(qb => {
                        qb.select('id', 'username');
                        qb.whereRaw(`LOWER("users"."username") = ANY(?)`, [usernames]);
                    })
                    .fetchAll({ transacting: trx })
                    .then(setUserEntityIds)
                    .catch(ferror.constraint(reject));
            }

            function setUserEntityIds(user_collection) {
                if (!user_collection.length) return done();

                for (let user of user_collection.models) {
                    user_references[user.get('username').toLowerCase()].entity_id = user.get('id');
                }

                done();
            }

            function done() {
                comment_model.set('entities', entities);
                if (!entities.length) {
                    return resolve(comment_model);
                }

                CommentEntity.knex('comment_entities')
                    .transacting(trx)
                    .insert(entities)
                    .then(() => {
                        resolve(comment_model);
                    })
                    .catch(ferror.constraint(reject));
            }
        });
    }
}

module.exports = new CommentController;

const GalleryController = require('./Gallery');
const NotificationController = require('./Notification');
const StoryController = require('./Story');
const UserController = require('./User');