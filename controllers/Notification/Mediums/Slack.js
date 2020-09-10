'use strict';

const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const Promise = require('bluebird');
const request = require('superagent');

/**
 * Slack Notifications Controller
 * Handles Slack team notifications.
 */
class SlackNotificationController {

    /**
     * Sends slack message
     *
     * @param {object} options
     * @param {string} options.message
     * @param {string} options.channel
     * 
     * @returns {Promise}
     */
    send({ message = 'Someone called SlackNotificationController#send without a message', channel = 'howtall' } = {}) {
        return new Promise((resolve, reject) => {
            request
                .post(config.SLACK.WEBHOOK)
                .send({
                    channel: channel,
                    text: message
                })
                .end((err, res) => {
                    if (err) reject(ferror(err).msg('Could not send slack message'));
                    else resolve(res.text);
                });
        });
    }
}

module.exports = new SlackNotificationController;