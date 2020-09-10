'use strict';

const config = require('../../config');

const _ = require('lodash');
const Promise = require('bluebird');

const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const scheduler = require('../../lib/scheduler');
const stripe = require('../../lib/stripe');
const reporter = require('../../lib/reporter');

const Assignment = require('../../models/assignment');
const Post = require('../../models/post');
const Purchase = require('../../models/purchase');
const Outlet = require('../../models/outlet');
const User = require('../../models/user');

/**
 * Outlet purchase class
 * @description Used for managing purchase events and for managing the access of an outlet's purchases
 */
class PurchaseController {
    
}

module.exports = new PurchaseController

const NotificationController = require('../Notification');