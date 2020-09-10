'use strict';

const config = require('../config');
const Redis = require('redis');

module.exports.client = Redis.createClient({
    url: config.AWS.REDIS.URI,
    retry_strategy: function(options) {
        if (options.error.code === 'ECONNREFUSED') {
            return new Error('Connection refused');
        } else if (options.total_retry_time > 3000 * 60) {
            return new Error('Connection timed out');
        } else if (options.attempt >= 3) {
            return new Error('Connection retry limit reached')
        } else {
            console.warn('Unable to connect to redis on attempt ' + options.attempt);
            return (options.attempt * 1000) + 1000;
        }
    }
});

module.exports.client.on('connect', () => {
    console.log('Rate limiter connected to redis');
});
module.exports.client.on('error', err => {
    if (err.code === 'ETIMEDOUT') {
        console.error('Rate limiter cannot connect to redis');
    } else {
        console.error('RATE LIMITER REDIS ERROR');
        console.error(err);
    }
    console.error('Falling back to local memory cache');
});