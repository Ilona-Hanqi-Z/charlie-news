'use strict'
const config = require('../config')
module.exports = require('event-sdk')({
    endpoint: config.SCHEDULER.endpoint
})
// Attach some preset slugs defined via the config
module.exports.slugs = config.SCHEDULER.slugs
module.exports.paths = config.SCHEDULER.paths