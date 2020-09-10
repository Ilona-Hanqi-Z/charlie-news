'use strict'

const express = require('express');

const ferror = require('../../../../lib/frescoerror');
const hashids = require('../../../../lib/hashids');
const needs = require('../../../../lib/needs');

const middleware = require('../../../../middleware');

const NotificationController = require('../../../../controllers/Notification');

const Assignment = require('../../../../models/assignment');

const router = express.Router()

// TODO BASIC AUTH
router.post('/start',
    middleware.auth.permissions({
        client: 'scheduler:assignment:update'
    }),
    needs.body({
        assignment_id: 'int'
    }),
    (req, res, next) => {
        NotificationController.Types.Assignment
            .triggerStart(req.body.assignment_id)
            .then(r => res.status(200).send('OK'))
            .catch(next);
    }
);
router.post('/end',
    middleware.auth.permissions({
        client: 'scheduler:assignment:update'
    }),
    needs.body({
        assignment_id: 'int'
    }),
    (req, res, next) => {
        NotificationController.Types.Assignment
            .triggerEnd(req.body.assignment_id)
            .then(r => res.status(200).send('OK'))
            .catch(next);
    }
);

module.exports = router;