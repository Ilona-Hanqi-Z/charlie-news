'use strict';

const config = require('../../config');

const Promise = require('bluebird');

const auth = require('../../lib/auth');
const ferror = require('../../lib/frescoerror');
const hashIds = require('../../lib/hashids');
const stripe = require('../../lib/stripe');

const OutletPayment = require('../../models/outlet_payment');
const Purchase = require('../../models/purchase');
const User = require('../../models/user');

class StripeController {

    /**
     * Processes incoming Stripe webhooks
     * 
     * @param body {Object} Stripe request body
     * @param trx {Transaction}
     * 
     * @returns {Promise}
     */
    webhook(body = {}, trx) {
        let promise;
        switch (body.type) {
            case 'account.updated':
                promise = this.account.updated(body.data.object, body.data.previous_attributes, trx);
                break;
            case 'account.external_account.updated':
                promise = this.account.external_account.updated(body.data.object, body.data.previous_attributes, trx);
                break;
            case 'balance.available':
                if (body.user_id) promise = Promise.resolve();
                else promise = this.balance.available(body.data.object, trx);
                break;
            case 'charge.failed':
                promise = this.charge.failed(body.data.object, trx);
                break;
            case 'charge.refunded':
                promise = this.charge.refunded(body.data.object, trx);
                break;
            case 'charge.succeeded':
                promise = this.charge.succeeded(body.data.object, trx);
                break;
            case 'customer.source.updated':
                promise = this.customer.source.updated(body.data.object, body.data.previous_attributes, trx);
                break;
            case 'transfer.failed':
                promise = this.account.transfer.failed(body.data.object, trx);
                break;
            default:
                promise = Promise.resolve()// Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid action type').param('type'));
                break;
        }
        return promise.catch(err => {
            switch (err.type()) {
                case ferror.NOT_FOUND:
                    return Promise.resolve() // Ignore NOT FOUND errors, stripe does not care
                default:
                    return Promise.reject(err)
            } 
        })
    }
};

module.exports = new StripeController;
module.exports.account = require('./account');
module.exports.balance = require('./balance');
module.exports.charge = require('./charge');
module.exports.customer = require('./customer');
module.exports.refund = require('./refund');

const NotificationController = require('../Notification');