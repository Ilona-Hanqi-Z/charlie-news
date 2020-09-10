'use strict'

const express = require('express');
const middleware = require('../../../middleware/');
const needs = require('../../../lib/needs');
const hashids = require('../../../lib/hashids');

const AWSController = require('../../../controllers/AWS')
const SubmissionController = require('../../../controllers/Submission')

const router = express.Router();
/**
 * Base Route
 * /v2/webhook/content
 * 
 * TODO TODO TODO TODO TODO TODO
 * Reenable auth middlewares when clientless requests are banned
 */

// For uploading via the S3 clients, the post_id field will be an id hash, so we need to
// decode it manually
function postIdDecode(req, res, next) {
    if (req.body.post_id.match(/[a-z]/i)) {
        req.body.post_id = hashids.decode(req.body.post_id);
    }
    next();
}

router.post('/photo/complete',
    middleware.auth.permissions({
        client: 'aws:post:update'
    }),
    postIdDecode,
    needs.body({
        post_id: 'int',
        height_: 'int',
        width_: 'int',
        key_: 'str'
    }),
    (req, res, next) => {
        SubmissionController
            .photoCompleteCallback(req.body.post_id, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);
router.post('/photo/failed',
    middleware.auth.permissions({
        client: 'aws:post:update'
    }),
    postIdDecode,
    needs.body({
        post_id: 'int'
    }),
    (req, res, next) => {
        SubmissionController
            .photoFailedCallback(req.body.post_id, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);
router.post('/photo/processing',
    middleware.auth.permissions({
        client: 'aws:post:update'
    }),
    postIdDecode,
    needs.body({
        post_id: 'int'
    }),
    (req, res, next) => {
        SubmissionController
            .photoProcessingCallback(req.body.post_id, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Callback called by the Elastic Transcoder which processes the video
 */
router.post('/video/transcoder',
    middleware.auth.permissions({
        client: 'aws:post:update'
    }),
    (req, res, next) => {
        AWSController
            .videoCallback(req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);
/**
 * Used by non-AWS clients to finish the video uploading process
 * 
 * TODO is this used ever?
 */
router.post('/video/failed',
    middleware.auth.permissions({
        client: 'aws:post:update'
    }),
    postIdDecode,
    needs.body({
        post_id_: 'int',
        recap_id_: 'int'
    }),
    (req, res, next) => {
        AWSController
            .videoFailedCallback(req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router