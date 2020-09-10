'use strict'

const express = require('express');
const middleware = require('../../../../middleware');
const needs = require('../../../../lib/needs');
const OutletController = require('../../../../controllers/Outlet');

const router = express.Router()

router.post('/daily',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.no.body,
    (req, res, next) => {
        OutletController
            .alertInactive()
            .then(() => res.status(200).send('OK'))
            .catch(next);
    }
);

module.exports = router;