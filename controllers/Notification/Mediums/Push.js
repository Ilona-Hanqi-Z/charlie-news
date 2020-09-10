'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const Installation = require('../../../models/installation');
const Promise = require('bluebird');
const reporter = require('../../../lib/reporter');
const winston = require('../../../lib/winston');

const SNS = new AWS.SNS({ apiVersion: '2010-03-31', region: 'us-east-1' });

/**
 * Generic Push Controller
 */
class PushNotificationController {

    /**
     * Sends a notification to the devices associated with the given
     * installations. Will also deactivate and delete installations if
     * they are disabled or don't exist, respectively.
     * 
     * @param {object} recipients
     * @param {Model<Installation>[]} [recipients.installations]
     * @param {string} [recipients.topic] TODO TEMPORARY
     * @param {(number[]|string[])} [recipients.user_ids]
     * @param {object} message
     * @param {string} message.title
     * @param {string} [message.body]
     * @param {*} [message.data]
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise<Model<Installation>[]>} pruned array of installations (failures trimmed)
     */
    send({ user_ids = [], installations = [], topic } = {}, message = {}, trx) {
        // TODO: integrate pub/sub here when completely moved off of SNS
        if (topic != null) {
            return this.tempSend(topic, message);
        }

        let promise, succeeded;

        if (user_ids.length > 0) {
            promise = Installation
                .query(qb => qb.whereIn('user_id', user_ids))
                .fetchAll({ transacting: trx })
                .then(coll => coll.models); // remove from collection
        } else {
            promise = Promise.resolve(installations);
        }

        return promise
            .then(installation_models => {
                let to_apns = [], to_gcm = [];

                for (let installation of installation_models) {
                    switch (installation.get('platform')) {
                        case 'android':
                            to_gcm.push(installation);
                            break;
                        case 'ios':
                            to_apns.push(installation);
                            break;
                        default:
                            // invalid installation, ignore
                            break;
                    }
                }

                return Promise.all([
                    NotificationController.Mediums.APNS.send(to_apns, message),
                    NotificationController.Mediums.GCM.send(to_gcm, message)
                ])
            })
            .then(([ apns_results = {}, gcm_results = {} ]) => {
                let failed = apns_results.failed.concat(gcm_results.failed);

                // get successfuly-contacted installation models
                succeeded = apns_results.sent.concat(gcm_results.sent).map(result => result.installation);

                if (failed.length === 0) return;

                winston.warn('Failed to push to installations:');

                return Installation
                    .query(qb => {
                        qb.whereIn('id', failed.map(result => {
                            winston.warn(result.error, '=>', result.installation.toJSON());
                            return result.installation.get('id');
                        }));
                    })
                    .destroy({ transacting: trx })
            })
            .then(() => succeeded) // return the successfully-contacted installations
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * (deprecated) Sends push notifications to specified topic.
     *
     * @param topic
     * @param data
     * @param data.title
     * @param data.body
     * @param data.data - Custom key-value pairs
     * 
     * @returns {Promise}
     */
    tempSend(topic, data = {}) {
        let subscriptionARNs = [];

        let apns_alert = data.title;
        if (data.body) {
            apns_alert = {
                title: data.title,
                body: data.body
            }
        }

        let payload_gcm = JSON.stringify({ data });
        let payload_apns = JSON.stringify(Object.assign({
            aps: {
                alert: apns_alert,
                sound: 'default'
            }
        }, data));

        let payload = JSON.stringify({
            default: data.title,
            MessageStructure: 'json',
            GCM: payload_gcm,
            APNS: payload_apns,
            APNS_SANDBOX: payload_apns
        });

        return new Promise((resolve, reject) => {
            SNS.publish({
                Message: payload,
                MessageStructure: 'json',
                TopicArn: topic
            }, (err, data) => {
                if (err) {
                    reporter.report(err);
                    return reject(ferror(err).msg('Could not publish to SNS'));
                }

                // Debug info for notifications
                winston.info(`Installations for notif: ${Array.isArray(installations) ? installations.length : 0} Subscribed to topic: ${Array.isArray(subscriptionARNs) ? subscriptionARNs.length : 0}`);
                resolve(data);
            });
        });
    }
}

module.exports = new PushNotificationController;

const NotificationController = require('../index');