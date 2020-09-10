'use strict'

const config = require('../../../config')
const utils = require('../../../utils')

const assert = require('assert')
const Promise = require('bluebird')

const ferror = require('../../../lib/frescoerror')
const stripe = require('../../../lib/stripe')

class StripeCustomerController {

    constructor() {

    }
}

module.exports = new StripeCustomerController
module.exports.source = require('./source')