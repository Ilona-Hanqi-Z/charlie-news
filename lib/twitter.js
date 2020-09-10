'use strict';

const Twitter = require('twitter');
const config = require('../config');

module.exports = new Twitter({
    consumer_key: config.TWITTER.CONSUMER_KEY,
    consumer_secret: config.TWITTER.CONSUMER_SECRET,
    access_token_key: config.TWITTER.OAUTH_TOKEN,
    access_token_secret: config.TWITTER.OAUTH_SECRET
});