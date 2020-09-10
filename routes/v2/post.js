'use strict';

const express = require('express');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');

const SubmissionController = require('../../controllers/Submission');
const PostController = require('../../controllers/Post');

const middleware = require('../../middleware');
const needs = require('../../lib/needs');

const router = express.Router();

router.post('/complete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:post:create'
    }),
    needs.body({
        key: 'str',
        uploadId: 'str',
        eTags: 'str[]'
    }),
    (req, res, next) => {
        SubmissionController
            .completeSubmission(res.locals.user, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:post:get', 'outlet:post:get', 'user:post:get']],
        client: 'client:post:get'
    }),
    needs.querystring({
        type_: [ 'video', 'photo' ],
        created_before_: 'datetime',
        created_after_: 'datetime',
        rating_: [['int', 'int[]']],
        geo_: needs.geoJSON,
        radius_: needs.miles_to_meters
    }).including(needs.pagination),
    (req, res, next) => {
        PostController
            .list(req.query, res.locals)
            .then(p => PostController.build(p, Object.assign({
                show_parent: true,
                show_owner: true,
                show_purchased: true
            }, res.locals)))
            .then(p => res.send(p))
            .catch(next);
    }
);

router.get('/submissions/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:post:get'
    }),
    needs.querystring({
        since_: 'datetime'
    }),
    (req, res, next) => {
        SubmissionController
            .report(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id/download',
    middleware.hashIds,
    middleware.auth.permissions({
        client: '3rd-party-temp:post:get', // TODO remove this extra rule 
        token: 'token:post:get',
        user: [['admin:post:get', 'outlet:post:get']]
    }),
    needs.spat_id,
    needs.no.querystring,
    (req, res, next) => {
        PostController
            .download(req.params.id, res.locals)
            .then(url => res.send({ result: url }))
            .catch(next)
    }
)

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:post:update'
    }),
    needs.spat_id,
    needs.body({
        location_: {
            lat: 'float',
            lng: 'float'
        },
        address_: 'str',
        license_: 'int'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        PostController
            .update(res.locals.user, req.params.id, req.body, res.locals.trx)
            .then(p => PostController.build(p, res.locals))
            .then(p => res.send(p))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id?/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:post:delete', 'user:post:delete']]
    }),
    needs.spat_id,
    needs.body({
        post_ids_: 'int[]'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        PostController
            .delete(res.locals.user, req.params.id || req.body.post_ids, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/:ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:post:get', 'user:post:get']],
        client: 'client:post:get'
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        let ids = req.params.ids;
        PostController
            .get(ids.length === 1 ? ids[0] : ids, res.locals)
            .then(p => PostController.build(p, Object.assign({
                show_parent: true,
                show_owner: true,
                show_purchased: true,
                build_parent: { show_assignment: true }
            }, res.locals)))
            .then(p => res.send(p))
            .catch(next);
    }
);

module.exports = router;