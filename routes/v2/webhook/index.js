'use strict';

const express = require('express');
// const middleware = require('../../../middleware');

const router = express.Router();

router.use('/content', require('./content'));
router.use('/stripe', require('./stripe'));
router.use('/zoho', require('./zoho'));
router.use('/trigger', require('./trigger/index'));

module.exports = router;