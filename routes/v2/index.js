'use strict';

const express = require('express');

const router = express.Router();

router.use('/assignment', require('./assignment'));
router.use('/auth', require('./auth'));
router.use('/client', require('./client'));
router.use('/feeds', require('./feeds'));
router.use('/gallery', require('./gallery'));
router.use('/health', require('./health'));
router.use('/notifications', require('./notifications'));
router.use('/outlet', require('./outlet'));
router.use('/post', require('./post'));
router.use('/purchase', require('./purchase'));
router.use('/recap', require('./recap'));
router.use('/story', require('./story'));
router.use('/terms', require('./terms'));
router.use('/user', require('./user'));
router.use('/mrss', require('./mrss'));
router.use('/webhook', require('./webhook'));
router.use('/search', require('./search'));
router.use('/version', require('./version'));

module.exports = router;