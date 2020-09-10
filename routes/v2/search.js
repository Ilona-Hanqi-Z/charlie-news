'use strict';

const express = require('express');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');
const Promise = require('bluebird');
const _ = require('lodash');

const ArticleController = require('../../controllers/Article');
const AssignmentController = require('../../controllers/Assignment');
const GalleryController = require('../../controllers/Gallery');
const OutletController = require('../../controllers/Outlet');
const PostController = require('../../controllers/Post');
const StoryController = require('../../controllers/Story');
const UserController = require('../../controllers/User');

const UserModel = require('../../models/user');
const StoryModel = require('../../models/story');

const router = express.Router();

// TODO finalize the param set
const search_params = needs.querystring({
    count_: 'bool',
    q_:         'str',
    tags_:      'str[]',
    rating_: [['int', 'int[]']],
    created_before_: 'datetime',
    created_after_: 'datetime',
    updated_before_: 'datetime',
    updated_after_: 'datetime',
    geo_:       needs.geoJSON,
    geo_where_: ['intersects', 'contains', 'contained'],
    radius_:    needs.miles_to_meters,
    post_type_: ['photo', 'video'],
    
    stories_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        tags_: 'str[]',
        created_before_: 'datetime',
        created_after_: 'datetime',
        updated_before_: 'datetime',
        updated_after_: 'datetime',
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        a_: autocomplete => autocomplete,
        radius_: needs.miles_to_meters
    }).including(needs.pagination) ]],
    articles_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        a_: autocomplete => autocomplete,
        created_before_: 'datetime',
        created_after_: 'datetime',
    }).including(needs.pagination) ]],
    galleries_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        tags_: 'str[]',
        rating_: [['int', 'int[]']],
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        radius_: needs.miles_to_meters
    }).including(needs.pagination) ]],
    posts_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        tags_: 'str[]',
        rating_: [['int', 'int[]']],
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        radius_: needs.miles_to_meters,
        post_type_: ['photo', 'video']
    }).including(needs.pagination) ]],
    assignments_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        a_: autocomplete => autocomplete,
        rating_: [['int', 'int[]']],
        created_before_: 'datetime',
        created_after_: 'datetime',
        starts_before_: 'datetime',
        starts_after_: 'datetime',
        ends_before_: 'datetime',
        ends_after_: 'datetime',
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        radius_: needs.miles_to_meters
    }).including(needs.pagination) ]],
    users_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        a_: autocomplete => autocomplete
    }).including(needs.pagination) ]],
    outlets_: [[ 'bool', needs.querystring({
        count_: 'bool',
        q_: 'str',
        a_: autocomplete => autocomplete
    }).including(needs.pagination) ]]
}).including(needs.pagination);
router.get('/',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [[
            'user:story:get',
            'user:gallery:get',
            'user:post:get',
            'user:assignment:get',
            'user:user:get',
            'user:outlet:get'
        ]],
        client: [[
            'client:story:get',
            'client:gallery:get',
            'client:post:get',
            'client:assignment:get',
            'client:user:get',
            'client:outlet:get'
        ]]
    }),
    search_params,
    (req, res, next) => {
        let result = {};

        //Returns query for respective field
        const query = (field) => {
            return _.isObject(req.query[field]) ? req.query[field] : req.query;
        }

        Promise
            .all([
                !req.query.stories // Stories search
                    ? Promise.resolve()
                    : StoryController
                        .search(res.locals.user, query('stories'))
                        .then(r =>
                            StoryController
                                .build(res.locals.user, r.results, {
                                    filter: StoryModel.FILTERS.PUBLIC,
                                    show_curator: true,
                                    show_articles: true,
                                    show_thumbs: true,
                                    show_stats: true
                                })
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.stories = r)),
                !req.query.galleries // Gallery search
                    ? Promise.resolve()
                    : GalleryController
                        .search(res.locals.user, query('galleries'))
                        .then(r =>
                            GalleryController
                                .build(res.locals.user, r.results, {
                                    show_owner: true,
                                    show_curator: true,
                                    show_stories: true,
                                    show_articles: true,
                                    show_posts: true,
                                    show_stats: true
                                })
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.galleries = r)),
                !req.query.posts // Post search
                    ? Promise.resolve()
                    : PostController
                        .search(res.locals.user, query('posts'))
                        .then(r =>
                            PostController
                                .build(r.results, Object.assign({
                                    show_parent: true,
                                    show_owner: true,
                                    show_purchased: true,
                                }, res.locals))
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.posts = r)),
                !req.query.articles // Article search
                    ? Promise.resolve()
                    : ArticleController
                        .search(res.locals.user, query('articles'))
                        .then(r =>
                            ArticleController
                                .build(res.locals.user, r.results)
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.articles = r)),
                !req.query.assignments // Assignment search
                    ? Promise.resolve()
                    : AssignmentController
                        .search(res.locals.user, query('assignments'))
                        .then(r =>
                            AssignmentController
                                .build(res.locals.user, r.results, {
                                    show_thumbs: true,
                                    show_outlets: true,
                                    show_curator: true,
                                    show_stats: true
                                })
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.assignments = r)),
                !req.query.users // User search
                    ? Promise.resolve()
                    : UserController
                        .search(res.locals.user, query('users'))
                        .then(r =>
                            UserController
                                .build(res.locals.user, r.results, {
                                    filter: UserModel.FILTERS.PUBLIC,
                                    show_social_stats: true,
                                    show_submission_stats: true
                                })
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.users = r)),
                !req.query.outlets // Outlet search
                    ? Promise.resolve()
                    : OutletController
                        .search(res.locals.user, query('outlets'))
                        .then(r =>
                            OutletController
                                .build(res.locals.user, r.results, {
                                    show_owner: true
                                })
                                .then(() => Promise.resolve(r))
                        )
                        .then(r => Promise.resolve(result.outlets = r))
            ])
            .then(r => res.send(result))
            .catch(next);
    }
);

module.exports = router;