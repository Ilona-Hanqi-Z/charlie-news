'use strict'

const config = require('../config');
const Promise = require('bluebird')

const Stripe = require('stripe')

module.exports = Stripe(config.STRIPE.SECRET_KEY);
module.exports.statuses = {
    charge: {
        failed: -1,
        pending: 0,
        succeeded: 1
    },
    transfer: {
        failed: -1,
        cancelled: -1,
        pending: 0,
        in_transit: 0,
        paid: 1
    }
};