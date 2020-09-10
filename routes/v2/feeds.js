'use strict';

const express = require('express');
const FeedsController = require('../../controllers/Feeds');
const hashids = require('../../lib/hashids');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');

const router = express.Router();

router.get('/:id?/following',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:feeds:get', 'admin:feeds:get']],
        client: 'client:feeds:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        FeedsController
            .following(res.locals.user, req.params.id, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id?/user',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:feeds:get', 'admin:feeds:get']],
        client: 'client:feeds:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        FeedsController
            .user(res.locals.user, req.params.id, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id?/likes',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['user:feeds:get', 'admin:feeds:get']],
        client: 'client:feeds:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        FeedsController
            .likes(res.locals.user, req.params.id, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;