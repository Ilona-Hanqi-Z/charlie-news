'use strict';

const expressWinston = require('express-winston');
const winston = require('../lib/winston');

module.exports = expressWinston.logger({
    winstonInstance: winston,
    expressFormat: true,
    colorize: true,
    meta: false
});