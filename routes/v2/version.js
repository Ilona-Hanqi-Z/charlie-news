'use strict';

const express = require('express');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');

const ApiVersionController = require('../../controllers/ApiVersion');

const router = express.Router();

router.get('/current',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:api-version:get',
        client: 'client:api-version:get'
    }),
    needs.pagination,
    (req, res, next) => {
        ApiVersionController
            .getCurrent()
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:api-version:get',
        client: 'client:api-version:get'
    }),
    needs.pagination,
    (req, res, next) => {
        ApiVersionController
            .getAll()
            .then(res.send.bind(res))
            .catch(next);
    }
);

module.exports = router;