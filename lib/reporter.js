const config = require('../config');
const winston = require('./winston');
const raven = require('./raven');

module.exports = {
    report: function(err) {
        winston.error(err);

        if (config.SERVER.ENV !== 'test') {
            raven.captureException(err);
        }
    }
};