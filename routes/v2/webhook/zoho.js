'use strict'

const express = require('express');
const middleware = require('../../../middleware/');

const ZohoController = require('../../../controllers/Outlet/Zoho')

const router = express.Router();

/**
 * Base Route
 * /v2/webhook/zoho
 */
router.post('/',
    middleware.makeTransaction,
    middleware.auth.permissions({
        client: 'zoho:zoho:update'
    }),
    (req, res, next) => {
        let trx = res.locals.trx;

        ZohoController
            .webhook(req.body, res.locals)
            .then(r => res.send(r))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

module.exports = router