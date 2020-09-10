'use strict';

const _ = require('lodash');
const config = require('../../config/index');
const ferror = require('../../lib/frescoerror');
const Promise = require('bluebird');
const User = require('../../models/user');

/**
 * Notifications Controller
 * Handles SMS, Email, Push, and Fresco notifications.
 */
class NotificationController {

    /**
     * Aggregate notify function
     *
     * @param type {String}
     * @param recipients {Object} Users with their respective notification settings
     * @param recipients.users {Model[]}
     * @param recipients.outlets {Model[]}
     * @param payload {Object}
     * @param payload.fresco {Object}
     * @param payload.fresco.title {String}
     * @param payload.fresco.body {String}
     * @param payload.fresco.meta {Object}
     * @param payload.sms {String}
     * @param payload.email {Object}
     * @param payload.email.subject {String}
     * @param payload.email.title {String}
     * @param payload.email.body {String}
     * @param payload.push {Object}
     * @param payload.push.topic {String}
     * @param payload.push.target {String}
     * @param payload.push.title {String}
     * @param payload.push.url {String}
     * @param payload.push.message {String}
     * @param payload.push.sound {String}
     */
    notify({ type, recipients: { users = [], outlets = [] } = {}, payload = {}, skip_check = false } = {}, trx) {
        if (_.isArray(arguments[0])) {
            return Promise.map(arguments[0], obj => this.notify(obj, trx));
        }

        if (!_.isArray(users)) users = [users];
        if (!_.isArray(outlets)) outlets = [outlets];

        let user_ids = [], outlet_ids = [], withRelated = {};

        // `users` and `outlets` can be ids or models, break them down to ids
        if (users && users.length > 0) {
            user_ids = users.map(u => (isNaN(u)) ? u.get('id') : u);
        }
        if (outlets && outlets.length > 0) {
            outlet_ids = outlets.map(o => (isNaN(o)) ? o.get('id') : o);
        }

        if (!skip_check) {
            withRelated.settings = function() {
                this.where('type', 'notify-' + type);
            };
        }

        // Prepare the recipients (get relevant users, notification settings, etc)
        return User
            .query(qb => {
                if (outlet_ids.length > 0 || user_ids.length > 0) {
                    qb.where(function() {
                        if (user_ids.length > 0) this.whereIn('id', user_ids)
                        if (outlet_ids.length > 0) this.orWhereIn('outlet_id', outlet_ids);
                    });
                }

                User.QUERIES.ACTIVE(qb);
            })
            .fetchAll({
                transacting: trx,
                withRelated
            })
            .then(user_collection => {
                let to_emails = [], to_sms = [], to_fresco = [], to_push = [];

                for (let user_model of user_collection.models) {
                    let settings;
                    
                    if (user_model.related('settings').length === 0) {
                        if (skip_check) {
                            settings = { send_push: true, send_sms: true, send_fresco: true, send_email: true };
                        } else {
                            continue;
                        }
                    } else {
                        settings = user_model.related('settings').models[0].get('options')
                    }

                    if (payload.push != null && (skip_check || settings.send_push)) {
                        to_push.push(user_model.get('id'));
                    }
                    if (payload.fresco != null && (skip_check || settings.send_fresco)) {
                        to_fresco.push(user_model.get('id'));
                    }
                    if (payload.sms != null && (skip_check || settings.send_sms) && user_model.has('phone')) {
                        to_sms.push(user_model.get('phone'));
                    }
                    if (payload.email != null && (skip_check || settings.send_email) && user_model.has('email')) {
                        to_emails.push(user_model.get('email'));
                    }
                }

                // Tack on type param fresco notif
                if (payload.fresco) payload.fresco.type = type;
                if (payload.push) {
                    payload.push.data = payload.push.data || {}
                    payload.push.data.type = type;
                }

                return Promise
                    .all([
                        (to_emails.length > 0)
                            ? NotificationMediums.Email.send(to_emails, payload.email)
                            : Promise.resolve(null),
                        (to_sms.length > 0)
                            ? NotificationMediums.SMS.send(to_sms, payload.sms)
                            : Promise.resolve(null),
                        (to_fresco.length > 0)
                            ? NotificationMediums.Fresco.send(to_fresco, payload.fresco, trx)
                            : Promise.resolve(null),
                        (to_push.length > 0)
                            ? NotificationMediums.Push.send({ user_ids: to_push }, payload.push, trx)
                            : Promise.resolve(null)
                    ])
                    .then(([email_result, sms_result, fresco_result, push_result] = []) => {
                        return {
                            email: email_result,
                            sms: sms_result,
                            fresco: fresco_result,
                            push: push_result
                        };
                    })
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new NotificationController;
module.exports.Types = require('./Types');
const NotificationMediums = module.exports.Mediums = require('./Mediums');