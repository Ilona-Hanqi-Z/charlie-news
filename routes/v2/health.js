'use strict';

const express = require('express');

const needs = require('../../lib/needs');
const router = express.Router();

router.get('/ping',
    (req, res, next) => {
        res.send({ 'pong': 1 });
    }
);

module.exports = router;