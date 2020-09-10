const config = require('../config');

module.exports = require('plivo').RestAPI(config.PLIVO);