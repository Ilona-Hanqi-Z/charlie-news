'use strict';

const express = require('express');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');

const RecapController = require('../../controllers/Recap');

const router = express.Router();

router.post('/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:recap:create'
    }),
    needs.body({
        title: 'str',
        caption: 'str',
        tags_: 'str[]'
    }),
    (req ,res, next) => {
        RecapController
            .create(res.locals.user, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/callback', (req, res, next) => {
    RecapController.lambdaCallback(req.body).then(r => res.send(r)).catch(next);
});

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:recap:get'
    }),
    needs.pagination,
    (req, res, next) => {
        RecapController
            .list(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:recap:update'
    }),
    needs.spat_id,
    needs.body({
        caption_: 'str',
        title_: 'str'
    }),
    (req, res, next) => {
        RecapController
            .update(res.locals.user, req.params.id, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        token: 'token:recap:delete',
        user: 'admin:recap:delete'
    }),
    needs.spat_id,
    (req, res, next) => {
        RecapController
            .delete(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:ids',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:recap:get'
    }),
    needs.spat_ids,
    (req, res, next) => {
        let ids = req.params.ids;
        RecapController
            .get(res.locals.user, ids.length === 1 ? ids[0] : ids)
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;