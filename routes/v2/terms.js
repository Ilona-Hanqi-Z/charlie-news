'use strict';

const express = require('express');

const TermsController = require('../../controllers/Terms');

const middleware = require('../../middleware');

const router = express.Router();

router.get('/',
    middleware.auth.permissions({
        user: 'user:user:get',
        client: 'client:user:get'
    }, false),
    (req, res, next) => {
        TermsController
            .fetchTerms(res.locals.user)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/accept',
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        TermsController
            .agreeToTerms(res.locals.user, trx)
            .then(() => {
                trx.commit();
                res.send({ success: "ok" });
            })
            .catch(next);
    }
);

module.exports = router;
