'use strict';

const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const hashids = require('../../../lib/hashids');
const smooch = require('../../../lib/smooch');

/**
 * Smooch Notifications Controller
 * Handles customer support messaging
 */
class SmoochNotificationController {

    /**
     * Sends a smooch message to the given user
     * 
     * @param user_id   {Number}    The id of the user to send the notification to
     * @param text      {String}    The text of the message
     * @returns {Promise}
     */
    send(user_id, text) {
        return smooch.appUsers
            .sendMessage(hashids.encode(user_id), {
                type: 'text',
                role: 'appMaker',
                email: 'omar@fresconews.com',
                text
            })
            .catch(err => {
                let errObj = JSON.parse(err.response.body.read().toString());
                throw ferror(ferror.FAILED_REQUEST).msg(errObj.error.description);
            })
    }
}

module.exports = new SmoochNotificationController;