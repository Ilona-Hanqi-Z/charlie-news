'use strict';

const express = require('express');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const needs = require('../../lib/needs');

const AssignmentController = require('../../controllers/Assignment');
const PostController = require('../../controllers/Post');
const UserController = require('../../controllers/User');

const User = require('../../models/user');

const middleware = require('../../middleware');

const router = express.Router();

/**
 * Base Route
 * /v2/assignment/
 */

router.post('/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['outlet:assignment:create', 'admin:assignment:create']]
    }),
    needs.body({
        title: 'str',
        address_: 'str',
        caption: 'str',
        location_: [[ needs.geoJSON, 'null' ]],
        radius_: needs.miles_to_meters,
        rating_: 'int',
        starts_at: 'datetime',
        ends_at: 'datetime',
        is_acceptable_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;

        if(req.body.location && !req.body.address) {
            return next(ferror(ferror.INVALID_REQUEST).msg('Missing expected parameter address!'));
        }

        AssignmentController
            .create(res.locals.user, req.body, trx)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(a => res.send(a))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/find',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:assignment:get', 'outlet:assignment:get', 'admin:assignment:get']],
        client: 'client:assignment:get'
    }),
    needs.querystring({
        geo_: needs.geoJSON,
        radius_: needs.miles_to_meters,
        where_: ['intersects', 'contains', 'contained']
    }).including(needs.pagination),
    (req, res, next) => {
        AssignmentController
            .find(res.locals.user, req.query)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a.nearby.concat(a.global), {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true
                    })
                    .then(() => Promise.resolve(a))
            )
            .then(a => res.send(a))
            .catch(next);
    }
);

router.get('/posts/check',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:assignment:get', 'outlet:assignment:get', 'admin:assignment:get']],
        client: 'client:assignment:get'
    }),
    needs.querystring({
        geo: needs.geoJSON
    }).including(needs.pagination),
    (req, res, next) => {
        AssignmentController
            .checkPosts(res.locals.user, req.query)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a.nearby.concat(a.global), {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true
                    })
                    .then(() => Promise.resolve(a))
            )
            .then(a => res.send(a))
            .catch(next);
    }
);

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:assignment:get', 'outlet:assignment:get', 'admin:assignment:get']],
        client: 'client:assignment:get'
    }),
    needs.querystring({
        geo_: needs.geoJSON,
        radius_: needs.miles_to_meters,
        where_: ['intersects', 'contains', 'contained'],
        rating_: [['int', 'int[]']],
        starts_before_: 'datetime',
        starts_after_: 'datetime',
        ends_before_: 'datetime',
        ends_after_: 'datetime',
    }).including(needs.pagination),
    (req, res, next) => {
        AssignmentController
            .list(res.locals.user, req.query)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                    })
            )
            .then(a => res.send(a))
            .catch(next);
    }
);

router.get('/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['outlet:assignment-report:create', 'admin:assignment-report:create']]
    }),
    needs.querystring({
        since_: 'datetime'
    }),
    (req, res, next) => {
        AssignmentController
            .report(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id/posts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [[['outlet:assignment:get', 'outlet:post:get'], ['admin:assignment:get', 'admin:post:get']]]
    }),
    needs.spat_id,
    needs.querystring({
        rating_: [['int', 'int[]']],
        status_: [['int', 'int[]']]
    }).including(needs.pagination),
    (req, res, next) => {
        AssignmentController
            .posts(req.params.id, req.query, res.locals)
            .then(p =>
                PostController
                    .build(p, Object.assign({
                        keep_fields: ['first_look_until'],
                        show_parent: true,
                        show_owner: true,
                        show_purchased: true,
                    }, res.locals))
            )
            .then(p => res.send(p))
            .catch(next);
    }
);

router.post('/:id/accept',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:assignment:update'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AssignmentController
            .accept(res.locals.user, req.params.id, trx)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/unaccept',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:assignment:update'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AssignmentController
            .unaccept(res.locals.user, req.params.id, trx)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/:assignment_id/accepted',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:assignment:get'
    }),
    needs.spat({ assignment_id: 'int' }),
    needs.pagination,
    (req, res, next) => {
        AssignmentController
            .accepted(Object.assign(req.params, req.query), res.locals)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        filter: User.FILTERS.PUBLIC,
                        keep_fields: ['distance'],
                        show_social_stats: true,
                        show_submission_stats: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

router.get('/accepted',
    middleware.auth.permissions({
        user: 'user:assignment:get'
    }),
    middleware.hashIds,
    needs.no.querystring,
    (req, res, next) => {
        AssignmentController
            .acceptedBy(res.locals.user)
            .then(a =>
                a
                ? AssignmentController
                    .build(res.locals.user, a,{
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true
                    })
                : a
            )
            .then(a => res.send(a))
            .catch(next);
    }
);

/**
 * Approve the given assignment, applying the provided updates
 * 
 * NOTE: Transaction is committed from within controller function
 */
router.post('/:id/approve',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:assignment:update'
    }),
    needs.spat_id,
    needs.body({
        title_: 'str',
        address_: 'str',
        caption_: 'str',
        location_: [[ needs.geoJSON, 'null' ]],
        radius_: needs.miles_to_meters,
        starts_at_: 'datetime',
        ends_at_: 'datetime',
        is_acceptable_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AssignmentController
            .approve(res.locals.user, req.params.id, req.body, trx)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(a => res.send(a))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/reject',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:assignment:update'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {

        let trx = res.locals.trx;

        AssignmentController
            .reject(res.locals.user, req.params.id, trx)
            .then(a => res.send(a))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['outlet:assignment:get', 'admin:assignment:get']]
    }),
    needs.spat_id,
    needs.body({
        title_: 'str',
        address_: 'str',
        caption_: 'str',
        location_: [[ needs.geoJSON, 'null' ]],
        radius_: needs.miles_to_meters,
        rating_: 'int',
        starts_at_: 'datetime',
        ends_at_: 'datetime',
        is_acceptable_: 'bool',

        outlets_add_: 'int[]',
        outlets_remove_: 'int[]',
        posts_add_: 'int[]',
        posts_remove_: 'int[]'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AssignmentController
            .update(req.params.id, req.body, res.locals)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, Object.assign({
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true
                    }, res.locals))
            )
            .then(a => res.send(a))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/merge',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:assignment:update'
    }),
    needs.spat_id,
    needs.body({
        merge_into_id: 'int',

        title_: 'str',
        address_: 'str',
        caption_: 'str',
        location_: [[ needs.geoJSON, 'null' ]],
        radius_: needs.miles_to_meters,
        starts_at_: 'datetime',
        ends_at_: 'datetime'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AssignmentController
            .merge(res.locals.user, req.params.id, req.body, trx)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true,
                        trx
                    })
            )
            .then(a => res.send(a))
            .then(trx.commit)
            .catch(next);
});

router.get('/:ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:assignment:get', 'outlet:assignment:get', 'admin:assignment:get']],
        client: 'client:assignment:get'
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        let ids = req.params.ids;
        AssignmentController
            .get(res.locals.user, ids.length === 1 ? ids[0] : ids)
            .then(a =>
                AssignmentController
                    .build(res.locals.user, a, {
                        show_thumbs: true,
                        show_outlets: true,
                        show_curator: true,
                        show_stats: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;