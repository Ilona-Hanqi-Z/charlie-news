'use strict';

const config = require('../config');
const ferror = require('../lib/frescoerror');
const redisClient = require('../lib/redis').client;
const RateLimiter = require('rolling-rate-limiter');

const limiter = RateLimiter({
    namespace: 'RATE-LIMITER',
    client: redisClient,
    interval: 1000,
    maxInInterval: 100,
});

module.exports = (req, res, next) => {
    limiter(req.headers['x-forwarded-for'] || req.connection.remoteAddress, (err, time_blocked) => {
        if (err) {
            next(ferror(err).type(ferror.API));
        } else if (time_blocked) {
            next(
                ferror(ferror.RATE_LIMITER)
                    .msg(`You must wait ${time_blocked}ms before you can make requests.`)
            );
        } else {
            next();
        }
    });
};