'use strict'

const express = require('express');
const middleware = require('../../../middleware/');

const StripeController = require('../../../controllers/Stripe')

const router = express.Router();
/**
 * Base Route
 * /v2/webhook/stripe
 */

router.post('/',
    middleware.makeTransaction,
    middleware.auth.permissions({
        client: 'stripe:stripe:update'
    }),
    (req, res, next) => {
        let trx = res.locals.trx;
        StripeController
            .webhook(req.body, trx)
            .then(() => res.status(200).send('OK'))
            .then(trx.commit)
            .catch(next);
    }
);

module.exports = router;