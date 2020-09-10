'use strict';

const AWS = require('aws-sdk');
const Assignment = require('../../../models/assignment');
const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const Gallery = require('../../../models/gallery');
const hashids = require('../../../lib/hashids');
const Post = require('../../../models/post');
const Story = require('../../../models/story');
const User = require('../../../models/user');
const UserLocation = require('../../../models/user_location');

const SNS = new AWS.SNS({ apiVersion: '2010-03-31', region: 'us-east-1' });
const SLUGS = {
    FEATURED_GALLERY: 'user-news-gallery',
    FEATURED_STORY: 'user-news-story',
    TODAY_IN_NEWS: 'user-news-today-in-news',
    CUSTOM_PUSH: 'user-news-custom-push',
    NEW_ASSIGNMENT: 'user-dispatch-new-assignment',
    RECOMMENDED_CONTENT: 'outlet-recommended-content'
};

function encode(id) {
    return hashids.encode(parseInt(id, 10));
}

/**
 * Private function for sending out manual push notifications
 * 
 * @param {string} type notification type slug
 * @param {object} options
 * @param {Model<User>} [options.users] if not set, wil send to SNS topic of the given notif type
 * @param {*} options.payload
 * 
 * @returns {Promise<{ count }>}
 */
function __sendPush(type, { users, payload } = {}) {
    if (users) {
        return NotificationController
            .notify({
                type,
                recipients: { users },
                payload: {
                    push: payload
                }
            })
            .then(({ push } = {}) => {
                return {
                    count: push.length
                };
            });

        return Promise.resolve({ count: users.length });
    } else {
        let topic = config.AWS.SNS.NOTIFICATIONS[type];

        //noinspection JSIgnoredPromiseFromCall
        NotificationController.Mediums.Push.send({ topic }, payload);

        return new Promise((yes) => {
            SNS.getTopicAttributes({
                TopicArn: topic
            }, (err, data) => {
                if (err) {
                    reporter.report(err);
                    return yes({ count: 0 });
                }
                yes({ count: data.Attributes.SubscriptionsConfirmed });
            });
        });
    }
}

/**
 * Notifications Controller
 * Handles SMS, Email, Push, and Fresco notifications.
 */
class ManualNotificationController {

    /**
     * Send a notification about a featured gallery.
     * If users is not set, then the notification will be sent to all users
     *
     * @param {UserModel[]} users
     * @param {object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {int} options.gallery_id
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise}
     */
    sendFeaturedGallery(users, { title, body, gallery_id, trx } = {}) {
        return Gallery
            .forge({ id: gallery_id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        qb.select('image');
                        Post.QUERIES.VISIBLE(qb);
                        qb.orderBy('created_at', 'desc');
                        qb.limit(1);
                    }
                }
            })
            .then(gallery_model => {
                let post_model = gallery_model.related('posts').models[0];
                return __sendPush(SLUGS.FEATURED_GALLERY, {
                    users,
                    payload: {
                        title,
                        body,
                        data: {
                            image: post_model ? post_model.get('image') : null,
                            gallery_id: encode(gallery_id)
                        }
                    }
                });
            })
            .catch(Gallery.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid gallery'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Notify an outlet about a recommended piece of content.
     *
     * @param {UserModel[]} users
     * @param {object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {int} options.gallery_id
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise}
     */
    sendRecommendedContent(users, { title, body, gallery_ids = [], trx } = {}) {
        if (!Array.isArray(gallery_ids) || gallery_ids.length === 0) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing gallery ids')
            );
        }

        // Apply default this way as to ignore empty strings
        title = title || 'New Recommended Content';
        body = body || 'Top content picks from your Fresco editor';

        return Gallery
            .query(qb => {
                qb.whereIn('id', gallery_ids);
            })
            .fetchAll({
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        Post.QUERIES.VISIBLE(qb);
                        qb.orderBy('created_at', 'desc');
                    }
                }
            })
            .then(gallery_collection => {
                if (gallery_collection.models.length !== gallery_ids.length) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('One or more invalid galleries')
                    );
                }

                let email_content = gallery_collection.models.map(gallery_model =>
                    NotificationController.Mediums.Email.createEmailGallery(gallery_model, {
                        type: 'email',
                        email_name: 'recommended-content'
                    })
                );

                return NotificationController.notify({
                    type: SLUGS.RECOMMENDED_CONTENT,
                    recipients: { users },
                    payload: {
                        email: {
                            subject: title,
                            from_email: 'newsroom@fresconews.com',
                            from_name: 'Fresco Newsroom',
                            template_name: 'multi-gallery',
                            template_content: [
                                {
                                    name: 'galleries',
                                    content: email_content
                                },
                                {
                                    name: 'description',
                                    content: body
                                }
                            ]
                        }
                    }
                });
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send a notification with a list of galleries.
     * If users is not set, then the notification will be sent to all users
     *
     * @param {UserModel[]} users
     * @param {object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {int[]} options.gallery_ids
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise}
     */
    sendTodayInNews(users, { gallery_ids, title, body, trx } = {}) {
        if (gallery_ids.length === 0) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('At least one gallery required for "Today in News" alert')
            );
        }

        return Gallery
            .query(qb => qb.whereIn('id', gallery_ids))
            .fetchAll({
                transacting: trx,
                withRelated: {
                    posts: qb => {
                        qb.select('image');
                        Post.QUERIES.VISIBLE(qb);
                        qb.orderBy('created_at', 'desc');
                        qb.limit(1);
                    }
                }
            })
            .then(gallery_collection => {
                if (gallery_collection.length !== gallery_ids.length) {
                    return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('One or more invalid galleries!'));
                }
                let post_model = gallery_collection.models[0].related('posts').models[0];
                return __sendPush(SLUGS.TODAY_IN_NEWS, {
                    users,
                    payload: {
                        title,
                        body,
                        data: {
                            image: post_model ? post_model.get('image') : null,
                            gallery_ids: gallery_ids.map(encode)
                        }
                    }
                });
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send a notification about a featured story
     * If users is not set, then the notification will be sent to all users
     *
     * @param {UserModel[]} users
     * @param {object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {int[]} options.story_id
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise}
     */
    sendFeaturedStory(users, { title, body, story_id, trx } = {}) {
        return Story
            .forge({ id: story_id })
            .fetch({
                require: true,
                transacting: trx,
                withRelated: {
                    galleries: qb => {
                        qb.select('id');
                        Gallery.QUERIES.VISIBLE(qb);
                        qb.orderBy('updated_at', 'desc');
                        qb.limit(1);
                    },
                    'galleries.posts': qb => {
                        qb.select('image');
                        Post.QUERIES.VISIBLE(qb);
                        qb.orderBy('created_at', 'desc');
                        qb.limit(1);
                    }
                }
            })
            .then(story_model => {
                let post_model
                if (story_model.related('galleries').length > 0) {
                    post_model = story_model.related('galleries').models[0].related('posts').models[0];
                }
                return __sendPush(SLUGS.FEATURED_STORY, {
                    users,
                    payload: {
                        title,
                        body,
                        data: {
                            story_id: encode(story_id),
                            image: (!post_model)
                                        ? null
                                        : post_model.get('image')
                        }
                    }
                })
            })
            .catch(Story.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid story'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send a notification about a new assignment
     * If users is not set, then the notification will be sent to all users who intersect the assignment
     *
     * @param {UserModel[]} users
     * @param {object} options
     * @param {string} options.title
     * @param {string} options.body
     * @param {int} options.assignment_id
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise}
     */
    sendNewAssignment(users, { title, body, assignment_id, trx } = {}) {
        let assignment_model = Assignment.forge({ id: assignment_id });

        return assignment_model
            .fetch({
                require: true,
                transacting: trx
            })
            .then(() =>
                (users && users.length > 0)
                    ? Promise.resolve(users)
                    : AssignmentController.getUsers(assignment_id, trx)
            )
            .then(_users =>
                __sendPush(SLUGS.NEW_ASSIGNMENT, {
                    users: _users,
                    payload: {
                        title,
                        body,
                        data: {
                            is_global: !assignment_model.has('location'),
                            assignment_id: encode(assignment_id)
                        }
                    }
                })
            )
            .catch(Assignment.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid assignment'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send a push notification, meant to be called from the web platform.
     *
     * The promise this function returns will resolve before the notifications are actually sent.
     * This is because actually sending notifications to a large number of people can take some time, and we don't want
     * to 504.
     *
     * @param {object} options
     * @param {string} options.type
     * @param {object} options.content
     * @param {string} [options.content.title]
     * @param {string} [options.content.body]
     * @param {int[]} [options.content.gallery_ids]
     * @param {int} [options.content.gallery_id]
     * @param {int} [options.content.story_id]
     * @param {int} [options.content.assignment_id]
     * @param {object} options.recipients
     * @param {int[]} [options.recipients.user_ids]
     * @param {int[]} [options.recipients.outlet_ids]
     * @param {geojson} [options.recipients.geo]
     * @param {string} [options.recipients.where]
     * @param {number} [options.recipients.radius]
     * @param {object} context
     * @param {UserModel} context.user
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    notifyUsers(
        {
            type,
            content: {
                title,
                body,
                gallery_ids,
                gallery_id,
                story_id,
                assignment_id
            } = {},
            recipients: {
                user_ids,
                outlet_ids,
                geo,
                where,
                radius
            } = {}
        } = {},
        {
            user,
            trx
        } = {}
    ) {
        let promise;

        if (user_ids || outlet_ids || geo) {
            promise = User
                .query(qb => {
                    User.QUERIES.ACTIVE(qb);

                    if (user_ids && user_ids.length > 0) {
                        qb.whereIn('users.id', user_ids);
                    } else if (outlet_ids && outlet_ids.length > 0) {
                        qb.whereIn('users.outlet_id', outlet_ids);
                    } else if (geo) {
                        qb.rightOuterJoin('user_locations', 'users.id', 'user_locations.user_id');
                        UserLocation.queryGeo(qb, {
                            locationColumn: 'curr_geo',
                            geoJson: geo,
                            radius,
                            where
                        });
                    } else {
                        // If no query is specified, fetch no users.
                        // The controllers interpret empty recipient info as "send to all users"
                        qb.whereIn('users.id', []);
                    }
                })
                .fetchAll({ transacting: trx })
                .then(coll => coll.models);
        } else {
            promise = Promise.resolve(false);
        }

        return promise
            .then(users => {
                switch (type) {
                    case SLUGS.FEATURED_GALLERY:
                        return this.sendFeaturedGallery(users, { gallery_id, title, body, trx });
                    case SLUGS.TODAY_IN_NEWS:
                        return this.sendTodayInNews(users, { gallery_ids, title, body, trx });
                    case SLUGS.FEATURED_STORY:
                        return this.sendFeaturedStory(users, { story_id, title, body, trx });
                    case SLUGS.NEW_ASSIGNMENT:
                        return this.sendNewAssignment(users, { title, body, assignment_id })
                    case SLUGS.CUSTOM_PUSH:
                        return __sendPush(SLUGS.CUSTOM_PUSH, { users, payload: { title, body } });
                    default:
                        return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid notification type'));
                }
            })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send an outlet notification, meant to be called from the web platform.
     *
     * The promise this function returns will resolve before the notifications are actually sent.
     * This is because actually sending notifications to a large number of people can take some time, and we don't want
     * to 504.
     *
     * @param {object} options
     * @param {string} options.type
     * @param {object} options.content
     * @param {string} [options.content.title]
     * @param {string} [options.content.body]
     * @param {int[]} [options.content.gallery_ids]
     * @param {int} [options.content.gallery_id]
     * @param {int} [options.content.story_id]
     * @param {int} [options.content.assignment_id]
     * @param {object} options.recipients
     * @param {int[]} [options.recipients.user_ids]
     * @param {int[]} [options.recipients.outlet_ids]
     * @param {geojson} [options.recipients.geo]
     * @param {string} [options.recipients.where]
     * @param {number} [options.recipients.radius]
     * @param {boolean} [options.recipients.to_all]
     * @param {object} context
     * @param {UserModel} context.user
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    notifyOutlets(
        {
            type,
            content: {
                title,
                body,
                gallery_ids = []
            } = {},
            recipients: {
                user_ids = [],
                outlet_ids = [],
                to_all = false
            } = {}
        } = {},
        {
            user,
            trx
        } = {}
    ) {
        if (!to_all && user_ids.length === 0 && outlet_ids.length === 0) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing recipients')
            );
        }

        return User
            .query(qb => {
                User.QUERIES.ACTIVE(qb);
                qb.innerJoin('outlets', 'users.outlet_id', 'outlets.id');

                if (to_all) {
                    qb.where('outlets.verified', true);
                } else if (user_ids.length > 0) {
                    qb.whereIn('users.id', user_ids);
                } else {
                    qb.whereIn('users.outlet_id', outlet_ids);
                }
            })
            .fetchAll({ transacting: trx })
            .then(user_collection => {
                let users = user_collection.models;
                switch (type) {
                    case SLUGS.RECOMMENDED_CONTENT:
                        return this.sendRecommendedContent(users, { title, body, gallery_ids });
                    default:
                        return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid notification type'));
                }
            })
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new ManualNotificationController;

const AssignmentController = require('../../Assignment');
const NotificationController = require('../index');