'use strict';

const apn = require('apn');
const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const path = require('path');
const Promise = require('bluebird');
const reporter = require('../../../lib/reporter');
const winston = require('../../../lib/winston');

const APNSProvider = new apn.Provider({
    key:  path.join(__dirname, '../../../keys/' + config.PUSH.APNS.KEY_FILE),
    cert:  path.join(__dirname, '../../../keys/' + config.PUSH.APNS.CERT_FILE),
    production: config.SERVER.ENV === 'production'
});

/**
 * APNS Push Controller
 * Handles push notifications for iOS devices (APNS).
 */
class APNSController {

    /**
     * Push a message to a group of devices.  Note, this endpoint will not give
     * any information as to the result of each individual device token, only a
     * total of sucessful and failed attempts. To get the result of each token
     * individually, use the APNSController#send function.
     * 
     * @param {Model<Installation>[]} installations
     * @param {object} message
     * @param {string} message.title
     * @param {string} [message.body]
     * @param {*} [message.data]
     * 
     * @returns {Promise<{ sent, failed }>} hash of arrays containing the installations which sent or failed
     */
    send(installations = [], { title, body, sound = 'default', data = {} } = {}) {
        let result = {
            sent: [],
            failed: []
        };

        if (installations.length === 0) {
            return Promise.resolve(result);
        }

        let notification = new apn.Notification();
        let tokenLookup = {}; // used to refer to installations by device token

        if (!Array.isArray(installations)) {
            installations = [installations];
        }

        for (let installation of installations) {
            tokenLookup[installation.get('device_token')] = installation;
        }

        notification.topic = config.PUSH.APNS.BUNDLE_ID;
        notification.sound = sound;
        notification.payload = data;
        if (body) {
            notification.alert = {
                title,
                body
            };
        } else {
            notification.alert = title;
        }

        return APNSProvider
            .send(notification, Object.keys(tokenLookup))
            .then(response => {
                result.sent = response.sent.map(token => {
                    return {
                        installation: tokenLookup[token.device]
                    };
                });

                // Check for fatal errors
                for (let failure of response.failed) {
                    winston.warn(JSON.stringify(failure)); // Log failed reasons from APNS for Apple developer support
                    switch (failure.response.reason) {
                        case 'BadDeviceToken':
                        case 'MissingDeviceToken':
                        case 'Unregistered':
                            result.failed.push({
                                error: failure.response.reason,
                                installation: tokenLookup[failure.device]
                            });
                            continue;
                        default:
                            reporter.report(JSON.stringify(failure));
                            throw ferror(ferror.API).msg('Error pushing to APNS');
                    }
                }

                return result;
            })
            .catch(err => Promise.reject(ferror(err)));
    }
}

module.exports = new APNSController;