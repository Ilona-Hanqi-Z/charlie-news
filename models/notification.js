'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
const ferror = require('../lib/frescoerror');

const knex = bookshelf.knex;
const COLUMNS = Columns(
    'id',
    'type_id',
    'title',
    'body',
    'meta',
    'created_at'
);

const Notification = module.exports = bookshelf.model('Notification', ...Base({
    tableName: 'notifications',

    users: function() { return this.belongsToMany('User', 'notification_users', 'notification_id', 'user_id'); }
}, {
    COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS,
        FEED: COLUMNS.including('seen', 'seen_at', 'type').without('type_id')
    },
    
    /**
     * Get the notification feed for a given user
     * 
     * @param user_id {int}
     * @param pagination {object} optional
     * @param pagination.limit {int}
     * @param pagination.last {int}
     * @param trx {knex.Transaction} optional
     * 
     * @returns {Promise(array[bookshelf.model], ferror)}
     */
    getUserFeed(user_id, { limit = 10, last } = {}, trx) {
        return Notification
            .query(qb => {
                qb.from('notification_users');
                qb.select(
                    ...Notification.COLUMNS.map(s => `notifications.${s}`),
                    knex.raw('(CASE WHEN seen_at IS NULL THEN FALSE ELSE TRUE END) AS seen'),
                    'notification_users.seen_at',
                    'notification_users.created_at',
                    'notification_types.type'
                )
                qb.innerJoin('notifications', 'notification_users.notification_id', 'notifications.id');
                qb.innerJoin('notification_types', 'notification_types.id', 'notifications.type_id');
                qb.where('notification_users.user_id', user_id);
                if (last) {
                    qb.where(`notification_users.notification_id`, '<', last);
                }
                qb.orderBy('notification_users.created_at', 'desc');
                qb.orderBy('notification_users.notification_id', 'desc')
                qb.limit(limit);
            })
            .fetchAll({ transacting: trx })
            .then(coll =>
                Promise.resolve(coll.models.map(m => m.columns(Notification.FILTERS.FEED)))
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            )
    },

    /**
     * Get the number of unseen notifications for this user
     * 
     * @param user_id {int}
     * @param trx {knex.Transaction} optional
     * 
     * @returns {Promise(int, ferror)}
     */
    getUserUnseenCount(user_id, trx) {
        return knex('notification_users')
            .count('*')
            .where('user_id', user_id)
            .whereNull('seen_at')
            .transacting(trx)
            .then(([{ count = 0 } = {}] = []) =>
                Promise.resolve(parseInt(count, 10))
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    },

    /**
     * Mark the given notifications as seen
     * 
     * @param user_id {int}
     * @param notification_ids {array[int]|int}
     * @param trx {knex.Transaction}
     * 
     * @returns {Promise(undefined, ferror)}
     */
    see(user_id, notification_ids = [], trx) {
        if (!_.isArray(notification_ids)) notification_ids = [notification_ids];
        return knex('notification_users')
            .update({
                seen_at: knex.raw('CURRENT_TIMESTAMP')
            })
            .whereIn('notification_id', notification_ids)
            .where('user_id', user_id)
            .transacting(trx)
            .then(() =>
                Promise.resolve()
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }
}));