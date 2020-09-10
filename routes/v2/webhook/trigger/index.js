'use strict';

const express = require('express');
const middleware = require('../../../../middleware');

const router = express.Router();

router.use('/assignment', require('./assignment'));
router.use('/general', require('./general'));
router.use('/notification', require('./notification'));

module.exports = router;