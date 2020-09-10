'use strict';

const config = require('../../../config');
const ferror = require('../../../lib/frescoerror');
const Notification = require('../../../models/notification');
const NotificationType = require('../../../models/notification_type');

class FrescoNotificationController {

    /**
     * Get user's notification feed.
     *
     * @param user_model {Model} User whose notifications to fetch
     * @param pagination {Object}
     * 
     * @returns {Promise<{ feed, unseen_count }>}
     */
    feed(user_model, options, trx) {
        return Notification
            .getUserFeed(user_model.get('id'), options, trx)
            .then(models =>
                Notification
                    .getUserUnseenCount(user_model.get('id'), trx)
                    .then(count =>
                        Promise.resolve({
                            feed: models,
                            unseen_count: count
                        })
                    )
            );
    }

    /**
     * Mark a user's notification as seen
     * 
     * @param {Model<User>} user_model
     * @param {number[]} notif_ids id of notification(s) to see
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise<{ success: 'ok' }>}
     */
    see(user_model, notif_ids = [], trx) {
        return Notification
            .see(user_model.get('id'), notif_ids, trx)
            .then(() => Promise.resolve({ success: 'ok' }))
    }

    /**
     * Sends Fresco notification to fresco users
     *
     * @param {int[]} recipients
     * @param {String} type
     * @param {String} title
     * @param {String} body
     * @param {Object} meta
     * 
     * @returns {Promise}
     */
    send(recipients = [], { type_id, type, title, body, meta } = {}, trx) {
        if (type_id) {
            return send(type_id);
        } else if (type) {
            return NotificationType
                .where('type', type)
                .fetch({
                    require: true,
                    transacting: trx
                })
                .then(model =>
                    send(model.get('id'))
                )
                .catch(NotificationType.NotFoundError, () =>
                    Promise.reject(ferror(ferror.API).msg('Notification type not found'))
                );
        } else {
            return Promise.reject(
                ferror(ferror.API).msg('NotificationController.Mediums.Fresco#send: type_id or type required')
            );
        }

        function send(_type_id) {
            return new Notification({
                    type_id: _type_id,
                    title,
                    body,
                    meta
                })
                .save(null, { transacting: trx })
                .then(model =>
                    model
                        .users()
                        .attach(recipients, { transacting: trx })
                )
        }
    }
}

module.exports = new FrescoNotificationController;