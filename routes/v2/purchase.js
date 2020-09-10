'use strict';

const express = require('express');
const ferror = require('../../lib/frescoerror');
const PurchaseController = require('../../controllers/Purchase');
const hashids = require('../../lib/hashids');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');
const router = express.Router();

router.post('/create',
    middleware.auth.permissions({
        user: 'outlet:purchase:create'
    }),
    middleware.hashIds,
    needs.body({ post_id: 'int' }),
    middleware.makeTransaction,
    (req, res, next) => {
        PurchaseController
            .create(req.body, res.locals)
            .then(r =>
                PurchaseController
                    .build(r, Object.assign({
                        show_post: true,
                        show_user: true,
                        show_outlet: true,
                        show_assignment: true
                    }, res.locals))
            )
            .then(results => res.send(results))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

/**
 * Lists purchases
 * @description Lists purchases for passed outlets, or passed user outlet
 * /v2/purchase/list
 */
router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:purchase:get', 'outlet:purchase:get']],
        client: 'client:purchase:get'
    }),
    needs.querystring({
        outlet_ids_: 'int[]',
        user_ids_: 'int[]'
    }).including(needs.pagination),
    (req, res, next) => {
        PurchaseController
            .list(req.query, res.locals)
            .then(r =>
                PurchaseController
                    .build(r, Object.assign({
                        show_post: true,
                        show_user: true,
                        show_outlet: true,
                        show_assignment: true
                    }, res.locals))
            )
            .then(results => res.send(results))
            .catch(next);
    }
);

/**
 * Get calculated purchase stats, accessible by outlets and admins
 */
router.get('/stats',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:purchase:get', 'outlet:purchase:get']]
    }),
    needs.querystring({
        since_: 'datetime',
        outlet_ids_: 'str[]',
        user_ids_: 'int[]'
    }),
    (req, res, next) => {
        PurchaseController
            .purchaseStats(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);


/**
 * Generates the aggregated purchase date for analytics purposes
 * @description This data is converted to a CSV usaully client-side
 */
router.get('/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:purchase:get', 'outlet:purchase:get']]
    }),
    needs.querystring({
        since_: 'datetime',
        outlet_ids_: 'int[]',
        user_ids_: 'int[]'
    }),
    (req, res, next) => {
        PurchaseController
            .purchaseReport(req.query, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);


module.exports = router;