'use strict';

const express = require('express');

const ferror = require('../../lib/frescoerror');
const knex = require('../../lib/bookshelf');
const hashids = require('../../lib/hashids');
const needs = require('../../lib/needs');

const GalleryController = require('../../controllers/Gallery');
const PostController = require('../../controllers/Post');
const StoryController = require('../../controllers/Story');

const middleware = require('../../middleware');

const Gallery = require('../../models/gallery');

const router = express.Router();

/**
 * Base Route
 * /v2/story/
 */

router.get('/recent',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:story:get', 'user:gallery:get', 'user:post:get'],
        client: ['client:story:get', 'client:gallery:get', 'client:post:get']
    }),
    needs.querystring({
        created_before_: 'datetime',
        created_after_: 'datetime',
        updated_before_: 'datetime',
        updated_after_: 'datetime',
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        radius_: needs.miles_to_meters
    }).including(needs.pagination),
    (req, res, next) => {
        StoryController
            .recent(res.locals.user, req.query)
            .then(s =>
                StoryController
                    .build(res.locals.user, s, {
                        show_curator: true,
                        show_articles: true,
                        show_thumbs: true,
                        show_stats: true
                    })
            )
            .then(s => res.send(s))
            .catch(next);
    }
);

// TODO add galleries, articles to this
router.post('/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:story:create'
    }),
    needs.body({
        title: 'str',
        caption: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        StoryController
            .create(res.locals.user, req.body, trx)
            .then(s =>
                StoryController
                    .build(res.locals.user, s, {
                        show_curator: true,
                        show_articles: true,
                        show_thumbs: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:story:delete'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        StoryController
            .delete(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id/galleries',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:story:get', 'user:gallery:get', 'user:post:get'],
        client: ['client:story:get', 'client:gallery:get', 'client:post:get']
    }),
    needs.spat_id,
    needs.querystring({
        rating_: 'int'
    }).including(needs.pagination),
    (req, res, next) => {
        StoryController
            .galleries(res.locals.user, req.params.id, req.query)
            .then(g =>
                GalleryController
                    .build(res.locals.user, g, {
                        rating: req.query.rating,
                        filter: Gallery.FILTERS.PUBLIC,
                        show_owner: true,
                        show_curator: true,
                        show_stories: true,
                        show_articles: true,
                        show_posts: true,
                        show_stats: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id/posts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:story:get', 'user:gallery:get'],
        client: ['client:story:get', 'client:post:get']
    }),
    needs.spat_id,
    needs.querystring({
        rating_: 'int'
    }).including(needs.pagination),
    (req, res, next) => {
        StoryController
            .posts(res.locals.user, req.params.id, req.query)
            .then(p =>
                PostController
                    .build(p, Object.assign({
                        show_parent: true,
                        show_owner: true,
                        show_purchased: true
                    }, res.locals))
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:story:update'
    }),
    needs.spat_id,
    needs.body({
        title_: 'str',
        caption_: 'str',
        tags_: 'str[]',

        articles_new_: needs.articles,
        articles_add_: 'int[]',
        articles_remove_: 'int[]',
        galleries_add_: 'int[]',
        galleries_remove_: 'int[]'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        StoryController
            .update(res.locals.user, req.params.id, req.body, trx)
            .then(s =>
                StoryController
                    .build(res.locals.user, s, {
                        show_curator: true,
                        show_articles: true,
                        show_thumbs: true,
                        show_stats: true
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/like',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-like:create'
    }),
    needs.no.body,
    needs.spat_id,
    (req, res, next) => {
        StoryController
            .like(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

// TODO response object?
router.post('/:id/unlike',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-like:delete'
    }),
    needs.no.body,
    needs.spat_id,
    (req, res, next) => {
        StoryController
            .unlike(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

// TODO response object?
router.post('/:id/repost',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-repost:create'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        StoryController
            .repost(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

// TODO response object?
router.post('/:id/unrepost',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-repost:delete'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        StoryController
            .unrepost(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id/comments',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-comment:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        StoryController
            .comments(res.locals.user, req.params.id, req.query)
            .then(c =>
                CommentController
                    .build(res.locals.user, c, {
                        show_user: true,
                        show_gallery: true,
                        show_story: true,
                        show_entities: true,
                        show_position: true
                    })
            )
            .then(c => res.send(c))
            .catch(next);
    }
);

router.post('/:id/comment',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:story-comment:create'
    }),
    needs.spat_id,
    needs.body({
        comment: 'str'
    }),
    (req, res, next) => {
        StoryController
            .comment(res.locals.user, req.params.id, req.body.comment)
            .then(c =>
                CommentController
                    .build(res.locals.user, c, {
                        show_user: true,
                        show_gallery: true,
                        show_story: true,
                        show_entities: true,
                        show_position: true
                    })
            )
            .then(c => res.send(c))
            .catch(next);
    }
);

router.post('/:id/comment/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['admin:story-comment:delete', 'user:story-comment:delete']
    }),
    needs.spat_id,
    needs.body({ comment_id: 'int' }),
    (req, res, next) => {
        StoryController
            .uncomment(res.locals.user, req.params.id, req.body.comment_id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:story:get', 'user:gallery:get', 'user:post:get'],
        client: ['client:story:get', 'client:gallery:get', 'client:post:get']
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        let ids = req.params.ids;
        StoryController
            .get(res.locals.user, ids.length === 1 ? ids[0] : ids)
            .then(s =>
                StoryController
                    .build(res.locals.user, s, {
                        show_curator: true,
                        show_articles: true,
                        show_thumbs: true,
                        show_stats: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;