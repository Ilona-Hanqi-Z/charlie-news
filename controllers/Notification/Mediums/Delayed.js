'use strict';

const _ = require('lodash');
const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const Promise = require('bluebird');
const scheduler = require('../../../lib/scheduler');

/**
 * Delayed Notifications Controller
 * Handles notifications that rely on the scheduler for delayed delivery
 */
class DelayedNotificationController {

    /**
     * Sends a delayed verson of the notification
     * 
     * NOTE: When updating an event, you CANNOT only define updates, you must redefine all
     * fields
     * 
     * @param args {Object}
     * @param args.type {String} Notification group identifier (notification type)
     * @param args.key {String} Event unique identifier (unique per-group)
     * @param args.delay {Integer} Delay (in seconds) for dispatching the notification`
     * @param args.fields {Object} Notification callback payload
     * @param args.behaviors {Object} Behaviors to impose on the provided keys
     */
    send({
        type,
        key,
        delay = (60 * 15 /* 15 minutes */),
        fields = {},
        behaviors: {
            $inc = [], // For given fields, adds value passed `fields` to value in event
            $dec = [], // For given fields subtracts the value passed in `fields` from value in event
            $push = [], // For given fields, pushes the value passed in `fields` to the array in event
            $pull = [] // For given fields, pulls the value passed in `fields` from the array in event
        } = {}
    } = {}) {
        if (config.SERVER.ENV === 'test') {
            return Promise.resolve();
        }

        let params = {
            run_in: delay,
            request: {
                href: config.SERVER.API_ROOT + config.SCHEDULER.paths.delayed_notification + '/' + type,
                headers: {
                    Authorization: 'Basic ' + config.SCHEDULER.client_credentials_base64
                },
                method: 'post',
                body: fields
            },
        };
        return scheduler
            .get(type, key)
            .catch(err => Promise.reject(ferror(err)))
            .then(event => event ? updateEvent(event) : createEvent())

        function updateEvent(event) {
            for (let i in fields) {
                if ($inc.includes(i)) {
                    fields[i] += (event.request.body[i] || 0);
                } else if ($dec.includes(i)) {
                    fields[i] = (event.request.body[i] || 0) - fields[i];
                } else if ($push.includes(i)) {
                    let val = event.request.body[i]
                    if (!_.isArray(val)) val = [];
                    val.forEach(v => {
                        if (!fields[i].includes(v)) fields[i].push(v);
                    });
                } else if ($pull.includes(i)) {
                    let vals = event.request.body[i]
                    if (!_.isArray(vals)) vals = [];
                    fields[i] = vals.filter(v => !fields[i].includes(v))
                }
            }
            delete params.run_in;
            return scheduler.update(event, params)
        }

        function createEvent() {
            return scheduler.add(type, key, params)
        }
    }
}

module.exports = new DelayedNotificationController;