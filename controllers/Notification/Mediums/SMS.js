'use strict';

const _ = require('lodash');
const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const plivo = require('../../../lib/plivo');
const Promise = require('bluebird');

/**
 * SMS Notifications Controller
 */
class SMSNotificationController {

    /**
     * Sends SMS to recipients with provided payload
     *
     * @param {string[]} recipients array of phone numbers
     * @param {string} payload sms body
     * 
     * @returns {Promise}
     */
    send(recipients = [], payload = "") {
        if (!_.isArray(recipients)) recipients = [recipients];
        if (recipients.length === 0 || recipients[0] == null) return Promise.resolve(null);

        // add '1' prefix to all numbers without country codes, then combine into a destination string
        recipients = recipients.map(num => (num.length === 10) ? '1'+num : num).join('<');

        return new Promise((resolve, reject) => {
            plivo.send_message({
                src: config.PLIVO.NOTIF_NUMBER,
                dst: recipients,
                text: payload
            }, (status, response) => {
                if (status < 200 || status >= 300 || response.error) {
                    return reject(ferror(ferror.API).msg('Error sending SMS'));
                }

                resolve(response);
            });
        });
    }
}

module.exports = new SMSNotificationController;