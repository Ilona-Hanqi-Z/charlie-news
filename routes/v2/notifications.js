'use strict';

const middleware = require('../../middleware');
const NotificationController = require('../../controllers/Notification');

const express = require('express');
const router = express.Router();

const needs = require('../../lib/needs');

router.post('/user/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:notification:create'
    }),
    needs.body({
        type: [
            'user-news-today-in-news',
            'user-news-gallery',
            'user-news-story',
            'user-news-custom-push',
            'user-dispatch-new-assignment'
        ],
        content_: {
            title_: 'str',
            body_: 'str',
            gallery_ids_: 'int[]',
            gallery_id_: 'int',
            story_id_: 'int',
            assignment_id_: 'int'
        },
        recipients_: {
            user_ids_: 'int[]',
            outlet_ids_: 'int[]',

            geo_: needs.geoJSON,
            where_: ['within', 'intersects', 'contains', 'contained'],
            radius_: needs.miles_to_meters
        }
    }),
    (req, res, next) => {
        NotificationController.Types.Manual
            .notifyUsers(req.body, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/outlet/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:notification:create'
    }),
    needs.body({
        type: [
            'outlet-recommended-content'
        ],
        content: {
            title_: 'str',
            body_: 'str',
            gallery_ids_: 'int[]'
        },
        recipients: {
            user_ids_: 'int[]',
            outlet_ids_: 'int[]',
            to_all_: 'bool'
        }
    }),
    (req, res, next) => {
        NotificationController.Types.Manual
            .notifyOutlets(req.body, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/smooch',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:notification:create'
    }),
    needs.body({
        user_id: 'int',
        body: 'str'
    }),
    (req, res, next) => {
        NotificationController.Mediums.Smooch
            .send(req.body.user_id, req.body.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;