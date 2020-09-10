'use strict';

const winston = require('winston');
const os = require('os');

// Winston Papertrail is weird, in that it attaches itself to the winston.transports object
//noinspection BadExpressionStatementJS
require('winston-papertrail').Papertrail;

const config = require('../config');

let logger;
if (config.SERVER.ENV === 'test') {
    logger = new winston.Logger({
        transports: [
            new winston.transports.Console({ colorize: true })
        ]
    });
}
else {
    let winstonPapertrail = new winston.transports.Papertrail({
        host: config.PAPERTRAIL.host,
        port: config.PAPERTRAIL.port,
        colorize: true,
        hostname: `${config.SERVER.ENV}-${os.hostname()}`
    });

    winstonPapertrail.on('error', err => console.log(`Error connecting to Papertrail: ${err}`));

    logger = new winston.Logger({
        transports: [
            new winston.transports.Console({ colorize: true }),
            winstonPapertrail
        ]
    });
}

module.exports = logger;