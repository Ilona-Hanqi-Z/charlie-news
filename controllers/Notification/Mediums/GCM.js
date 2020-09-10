'use strict';

const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const gcm = require('node-gcm');
const Promise = require('bluebird');
const reporter = require('../../../lib/reporter');

const GCMSender = new gcm.Sender(config.PUSH.GCM.API_KEY);

Promise.promisifyAll(GCMSender);

/**
 * GCM Push Controller
 * Handles push notifications for Android devices (GCM/Firebase).
 */
class GCMController {

    /**
     * Push a message to a group of devices.  Note, this endpoint will not give
     * any information as to the result of each individual device token, only a
     * total of sucessful and failed attempts. To get the result of each token
     * individually, use the GCMController#send function.
     * 
     * @param {Model<Installation>[]} installations
     * @param {object} message
     * @param {string} message.title
     * @param {string} [message.body]
     * @param {*} [message.data]
     * 
     * @returns {Promise<{ sent, failed }>} hash of arrays containing the installations which sent or failed
     */
    send(installations = [], { title, body, data = {} } = {}) {
        let result = {
            sent: [],
            failed: []
        };

        if (installations.length === 0) return Promise.resolve(result);
        if (!data.title) data.title = title;
        if (!data.body) data.body = body;
        if (!Array.isArray(installations)) installations = [installations];

        let message = new gcm.Message({ data }); // TODO don't remember why we're using data.title/data.body over title/body
        let tokenLookup = {};
        let groups = [];

        // Break requests into chunks of 1000 (the max number of recipients per request)
        let index = 0;
        while (index < installations.length) {
            let arr = [];
            for (let i = index; i < installations.length && i < index + 1000; ++i) {
                let token = installations[i].get('device_token');
                arr.push(token);
                tokenLookup[token] = installations[i];
            }
            groups.push(arr);
            index += 1000;
        }

        return Promise
            .each(groups, group =>
                GCMSender
                    .sendAsync(message, { registrationTokens: group })
                    .then(response => {
                        // NOTE: response.results preserves the group order
                        for (let i = 0; i < response.results.length; ++i) {
                            let responseResult = response.results[i];

                            // If this push was successful, skip error checking
                            if (typeof responseResult.message_id === 'string') {
                                result.sent.push({ installation: tokenLookup[group[i]] });
                                continue;
                            }

                            switch (responseResult.error) {
                                case 'MissingRegistration':
                                case 'InvalidRegistration':
                                case 'NotRegistered':
                                case 'MismatchSenderId':
                                    result.failed.push({
                                        error: responseResult.error,
                                        installation: tokenLookup[group[i]]
                                    });
                                    break;
                                default:
                                    reporter.report(JSON.stringify(responseResult));
                                    throw ferror(ferror.API).msg('Error pushing to GCM');
                            }
                        }
                    })
            )
            .then(() => result)
            .catch(err => Promise.reject(ferror(err)));
    }
}

module.exports = new GCMController;