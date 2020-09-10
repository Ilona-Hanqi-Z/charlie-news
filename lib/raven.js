'use strict';

const config = require('../config');

if (config.SERVER.ENV === 'test') {
    //Mock raven for testing
    return module.exports = {
        captureException: console.error,
        requestHandler: () => (req, res, next) => next(),
        errorHandler: () => {}
    };
}

const raven = require('raven');

raven.config(config.SENTRY.url, {
    autoBreadcrumbs: {
        console: true,
        http: false, // Disable http breadcrumbs, they make aws go all wonky
        postgres: true
    }
}).install();

module.exports = raven;