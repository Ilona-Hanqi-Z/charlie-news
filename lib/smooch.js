'use strict';

const SmoochCore = require('smooch-core');

const config = require('../config');

const smoochCode = new SmoochCore({
    keyId: config.SMOOCH.KEY_ID,
    secret: config.SMOOCH.SECRET,
    scope: 'app'
});

module.exports = smoochCode;
