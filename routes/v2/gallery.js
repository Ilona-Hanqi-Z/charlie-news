'use strict';

const express = require('express');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const needs = require('../../lib/needs');

const CommentController = require('../../controllers/Comment');
const GalleryController = require('../../controllers/Gallery');
const UserController = require('../../controllers/User');
const PostController = require('../../controllers/Post');
const ReportController = require('../../controllers/Report');

const Post = require('../../models/post');
const User = require('../../models/user');

const middleware = require('../../middleware');

const router = express.Router();

/**
 * Base Route
 * /v2/gallery/
 */

router.get('/highlights',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:gallery:get', 'user:post:get'],
        client: ['client:gallery:get', 'client:post:get']
    }),
    needs.pagination,
    (req, res, next) => {
        GalleryController
            .highlights(req.query, res.locals)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true
            }))
            .then(g => res.send(g))
            .catch(next);
    }
);

router.post('/submit',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:gallery:create', 'user:post:create']
    }),
    needs.body({
        caption: 'str',
        address_: 'str',
        tags_: needs.tags,
        articles_new_: needs.articles,
        articles_add_: 'int[]',
        posts_new_: needs.posts_new,
        assignment_id_: 'int',
        outlet_id_: 'int'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        GalleryController
            .submit(req.body, res.locals)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                keep_fields: ['posts_new'],
                trx: res.locals.trx
            }))
            .then(g => res.send(g))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

router.post('/import',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['admin:gallery:create', 'admin:post:create']
    }),
    needs.body({
        editorial_caption_: 'str',
        caption_: 'str',
        address_: 'str',
        tags_: 'str[]',
        rating_: 'int',
        external_id_: 'str',
        external_url_: 'str',
        external_account_name_: 'str',
        external_account_username_: 'str',
        external_source_: 'str',
        assignment_id_: 'int',
        outlet_id_: 'int',

        posts_new_: needs.posts_new,
        posts_add_: 'int[]',
        articles_new_: needs.articles,
        articles_add_: 'int[]',
        stories_new_: needs.stories,
        stories_add_: 'int[]'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        GalleryController
            .import(req.body, res.locals)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                keep_fields: ['posts_new'],
                trx: res.locals.trx
            }))
            .then(g => res.send(g))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [[['user:gallery:get', 'user:post:get'], ['admin:gallery:get', 'admin:post:get']]],
        client: ['client:gallery:get', 'client:post:get']
    }),
    needs.querystring({
        rating_: [['int', 'int[]']],
        imported_: 'bool',
        created_before_: 'datetime',
        created_after_: 'datetime',
        updated_before_: 'datetime',
        updated_after_: 'datetime',
        highlighted_before_: 'datetime',
        highlighted_after_: 'datetime',
        geo_: needs.geoJSON,
        geo_where_: ['intersects', 'contains', 'contained'],
        radius_: needs.miles_to_meters
    }).including(needs.pagination),
    (req, res, next) => {
        GalleryController
            .list(req.query, res.locals)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                show_assignment: true
            }))
            .then(g => res.send(g))
            .catch(next);
    }
);

router.get('/reported',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery-report:get'
    }),
    needs.querystring({
        reasons_: 'str[]'
    }).including(needs.pagination),
    (req, res, next) => {
        GalleryController
            .reported(res.locals.user, req.query)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                show_report_stats: true,
                build_owner: {
                    filter: User.FILTERS.PUBLIC.including('suspended_until')
                }
            }))
            .then(g => res.send(g))
            .catch(next);
    }
);

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:gallery:update', 'admin:gallery:update']]
    }),
    needs.spat_id,
    needs.body({
        editorial_caption_: 'str',
        caption_: 'str',
        address_: 'str',
        tags_: 'str[]',
        rating_: [ 1, 2 ],
        is_nsfw_: 'bool',
        assignment_id_: [[ 'int', 'null' ]],
        external_source_: 'str',
        external_account_name_: 'str',
        external_account_id_: 'str',
        external_id_: 'str',
        external_url_: 'str',
        owner_id_: [[ 'int', 'null' ]],
        posts_update_: needs.posts_update,
        posts_new_: needs.posts_new,
        posts_add_: 'int[]',
        posts_remove_: 'int[]',
        stories_new_: needs.stories,
        stories_add_: 'int[]',
        stories_remove_: 'int[]',
        articles_new_: needs.articles,
        articles_add_: 'int[]',
        articles_remove_: 'int[]',
        highlighted_at_: [['datetime', 'null']]
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .update(res.locals.user, req.params.id, req.body, trx)
            .then(g => GalleryController.build(res.locals.user, g, {
                keep_fields: ['posts_new'],
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                trx
            }))
            .then(g => res.send(g))
            .then(trx.commit)
            .catch(next);
    }
);

// TODO #build
router.get('/:id/posts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [[['user:gallery:get', 'user:post:get'], ['admin:gallery:get', 'admin:post:get']]],
        client: ['client:gallery:get', 'client:post:get']
    }),
    needs.spat_id,
    needs.querystring({
        rating_: 'int'
    }).including(needs.pagination),
    (req, res, next) => {
        GalleryController
            .posts(req.params.id, req.query, res.locals)
            .then(p => PostController.build(p, Object.assign({
                show_parent: true,
                show_owner: true,
                show_purchased: true
            }, res.locals)))
            .then(p => res.send(p))
            .catch(next);
    }
);

router.get('/:id/purchases',
    middleware.hashIds,
    needs.spat_id,
    middleware.auth.permissions({
        user: [['admin:purchase:get', 'user:purchase:get']]
    }),
    (req, res, next) => {
        GalleryController
            .purchases(req.params.id, res.locals)
            .then(p =>
                PostController
                    .build(p, Object.assign({
                        keep_fields: ['purchases']
                    }, res.locals))
            )
            .then(p => res.send(p))
            .catch(next);
    }
);

router.post('/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:gallery:delete', 'admin:gallery:delete']]
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .delete(res.locals.user, req.params.id, trx)
            .then(g => res.send(g))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/like',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-like:create'
    }),
    needs.no.body,
    needs.spat_id,
    (req, res, next) => {
        GalleryController
            .Social
            .like(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:gallery_id/repost/:repost_id/like',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:repost-like:create'
    }),
    needs.no.body,
    needs.spat({
        gallery_id: 'int',
        repost_id: 'int'
    }),
    (req, res, next) => {
        GalleryController
            .Social
            .like(res.locals.user, req.params.gallery_id, req.params.repost_id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/nsfw',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery:update'
    }),
    needs.no.body,
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        GalleryController
            .setNSFW(res.locals.user, req.params.id, true, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);
router.post('/:id/sfw',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery:update'
    }),
    needs.no.body,
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        GalleryController
            .setNSFW(res.locals.user, req.params.id, false, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/unlike',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-like:delete'
    }),
    needs.no.body,
    needs.spat_id,
    (req, res, next) => {
        GalleryController
            .Social
            .unlike(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/repost',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-repost:create'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        GalleryController
            .Social
            .repost(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/unrepost',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-repost:delete'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        GalleryController
            .Social
            .unrepost(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);


router.get('/:id/likes',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-like:get',
        client: 'client:gallery-like:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        GalleryController
            .Social
            .likes(res.locals.user, req.params.id, req.query)
            .then(u => UserController.build(res.locals.user, u, {
                filter: User.FILTERS.PUBLIC,
                show_social_stats: true
            }))
            .then(l => res.send(l))
            .catch(next);
    }
);


router.get('/:id/reposts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-repost:get',
        client: 'client:gallery-repost:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        GalleryController
            .Social
            .reposts(res.locals.user, req.params.id, req.query)
            .then(u => UserController.build(res.locals.user, u, {
                filter: User.FILTERS.PUBLIC,
                show_social_stats: true
            }))
            .then(r => res.send(r))
            .catch(next);
    }
);


router.get('/:id/comments',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-comment:get',
        client: 'client:gallery-comment:get'
    }),
    needs.spat_id,
    needs.querystring({
        show_user_: 'bool',
        show_gallery_: 'bool',
        show_story_: 'bool',
        show_entities_: 'bool',
        show_position_: 'bool'
    }).including(needs.pagination),
    (req, res, next) => {
        GalleryController
            .Social
            .comments(res.locals.user, req.params.id, req.query)
            .then(comments =>
                CommentController
                    .build(res.locals.user, comments, {
                        show_user: req.query.show_user,
                        show_gallery: req.query.show_gallery,
                        show_story: req.query.show_story,
                        show_entities: req.query.show_entities,
                        show_position: req.query.show_position
                    })
            )
            .then(c => res.send(c))
            .catch(next);
    }
);

router.get('/:gallery_id/comment/:comment_ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-comment:get',
        client: 'client:gallery-comment:get'
    }),
    needs.spat({
        gallery_id: 'int',
        comment_ids: 'int[]'
    }),
    (req, res, next) => {
        let comment_ids = req.params.comment_ids;
        CommentController
            .get(comment_ids.length === 1 ? comment_ids[0] : comment_ids, res.locals)
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
        user: 'user:gallery-comment:create'
    }),
    needs.spat_id,
    needs.body({ comment: 'str' }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .Social
            .comment(res.locals.user, req.params.id, req.body.comment, trx)
            .then(c =>
                CommentController
                    .build(res.locals.user, c, {
                        show_user: true,
                        show_gallery: true,
                        show_story: true,
                        show_entities: true,
                        show_position: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/comment/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:gallery-comment:delete', 'admin:gallery-comment:delete']]
    }),
    needs.spat_id,
    needs.body({ comment_id: 'int' }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .Social
            .uncomment(res.locals.user, req.body.comment_id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/:id/reports',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery-report:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        GalleryController
            .reports(res.locals.user, req.params.id, req.query)
            .then(r =>
                ReportController
                    .build(res.locals.user, r, {
                        show_user: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-report:create'
    }),
    needs.spat_id,
    needs.body({
        reason: ['spam', 'abuse', 'stolen', 'nsfw'],
        message: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .report(res.locals.user, req.params.id, req.body, trx)
            .then(r =>
                ReportController
                    .build(res.locals.user, r, {
                        show_user: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/report/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:gallery-report:delete'
    }),
    needs.spat_id,
    needs.body({ report_id: 'int' }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .unreport(res.locals.user, req.body.report_id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);
router.post('/:id/report/skip',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery-report:update'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .skipReport(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/report/act',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:gallery-report:update'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        GalleryController
            .actReport(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/:ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:gallery:get', 'admin:gallery:get']],
        client: 'client:gallery:get'
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        let ids = req.params.ids;
        GalleryController
            .get(ids.length === 1 ? ids[0] : ids, res.locals)
            .then(g => GalleryController.build(res.locals.user, g, {
                show_owner: true,
                show_curator: true,
                show_stories: true,
                show_articles: true,
                show_posts: true,
                show_stats: true,
                show_report_status: true,
                show_assignment: true
            }))
            .then(g => res.send(g))
            .catch(next);
    }
);

module.exports = router;
