'use strict';

const Assignment = require('../../../models/assignment');
const config = require('../../../config');
const ferror = require('../../../lib/frescoerror');
const Gallery = require('../../../models/gallery');
const hashids = require('../../../lib/hashids');
const Outlet = require('../../../models/outlet');
const polylineCircle = require('polyline-circle');
const Post = require('../../../models/post');
const Promise = require('bluebird');
const reporter = require('../../../lib/reporter');
const User = require('../../../models/user');

class AssignmentNotificationController {

    // TODO TEMP TEMP TEMP TEMP TEMP TEMP TEMP TEMP TEMP TEMP TEMP
    TEMPNOTIFYGLOBALASSIGNMENT(assignment_model, trx) {
        let notif_body = assignment_model.get('caption');
        if (notif_body.length > 500) {
            notif_body = notif_body.substr(0, 497) + '...';
        }
        return Promise.all([
            NotificationController.Mediums.Push.send({
                topic: config.AWS.SNS.NOTIFICATIONS['user-dispatch-new-assignment']
            }, {
                title: assignment_model.get('title'),
                body: notif_body,
                data: {
                    type: 'user-dispatch-new-assignment',
                    assignment_id: hashids.encode(assignment_model.get('id')),
                    is_global: true
                }
            }, trx),
            eyyyyy('ohhhhhh')
        ]);

        function eyyyyy() {
            let knex = Assignment.knex;
            return knex('notifications')
                .insert({
                    type_id: 22, // TODO set this for prod
                    title: assignment_model.get('title'),
                    body: notif_body,
                    meta: {
                        assignment_id: assignment_model.get('id'),
                        is_global: true
                    }
                })
                .returning('id')
                .transacting(trx)
                .then(([result] = []) => 
                    knex
                        .raw(`
                            INSERT INTO notification_users
                            (notification_id, user_id)
                            (
                                SELECT ?, users.id
                                FROM users
                                LEFT JOIN user_settings ON user_settings.user_id = users.id
                                WHERE
                                    user_settings IS NULL
                                    OR (
                                        user_settings.type = 'notify-user-dispatch-new-assignment'
                                        AND (
                                            user_settings.options->>'send_fresco' IS NULL
                                            OR user_settings.options->>'send_fresco' != 'false'
                                        )
                                    )
                            )
                        `, [result])
                )
                .catch(err => Promise.reject(ferror.constraint(err)))
        }
    }

    /**
     * Called by the scheduler via webhook to signify the start of an assignment
     *
     * @param id {Integer} assignment id
     * @param trx {knex.Transaction}
     */
    triggerStart(id, trx) {
        let _this = this;
        return Assignment
            .forge({ id })
            .fetch({
                require: true,
                columns: Assignment.GEO_FILTERS.ALL,
                transacting: trx
            })
            .then(assignment_model => {
                notifyUsers(assignment_model);
                return Promise.resolve();
            })
            .catch(Assignment.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND)))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notifyUsers(assignment_model) {
            if (!assignment_model.has('location')) {
                return _this.TEMPNOTIFYGLOBALASSIGNMENT(assignment_model, trx).catch(reporter.report);
            }

            User
                .query(qb => {
                    qb.innerJoin('user_locations', 'users.id', 'user_locations.user_id');
                    qb.where('user_locations.curr_timestamp', '>=', User.knex.raw("CURRENT_TIMESTAMP - INTERVAL '7 days'"));
                    qb.whereRaw(
                        `ST_Intersects(ST_Buffer(user_locations.curr_geo::geography, users.radius), ST_Buffer(ST_geomFromGeoJSON(?)::geography, ?))`,
                        [assignment_model.get('location'), assignment_model.get('radius') || 0]
                    );
                })
                .fetchAll({ transacting: trx })
                .then(({ models: user_models } = {}) => {
                    let notif_body = assignment_model.get('caption');
                    if (notif_body.length > 500) {
                        notif_body = notif_body.substr(0, 497) + '...';
                    }

                    NotificationController
                        .notify({
                            recipients: {
                                users: user_models
                            },
                            type: 'user-dispatch-new-assignment',
                            payload: {
                                fresco: {
                                    title: assignment_model.get('title'),
                                    body: notif_body,
                                    meta: {
                                        assignment_id: assignment_model.get('id'),
                                        is_global: !assignment_model.has('location')
                                    }
                                },
                                push: {
                                    title: assignment_model.get('title'),
                                    body: notif_body,
                                    data: {
                                        assignment_id: hashids.encode(assignment_model.get('id')),
                                        is_global: !assignment_model.has('location')
                                    }
                                }
                            }
                        })
                        .catch(reporter.report);
                })
                .catch(reporter.report);
        }
    }

    /**
     * Called by the scheduler via webhook to signify the end of an assignment
     * @param assignment_id
     * @param trx
     */
    triggerEnd(assignment_id, trx) {
        let assignment = Assignment.forge({ id: assignment_id });
        return assignment
            .fetch({
                require: true,
                columns: Assignment.GEO_FILTERS.ALL,
                withRelated: ['outlets', 'users'],
                transacting: trx
            })
            .then(() =>
                Gallery.knex
                    .raw(`
                        SELECT
                            COUNT(DISTINCT galleries.id) AS gallery_count,
                            SUM(CASE WHEN posts.video NOTNULL THEN 1 ELSE 0 END) AS video_count,
                            SUM(CASE WHEN posts.video ISNULL THEN 1 ELSE 0 END) AS photo_count
                        FROM posts
                        INNER JOIN galleries ON galleries.id = posts.parent_id
                        WHERE
                            posts.assignment_id = ?
                            AND galleries.rating >= ?
                            AND posts.rating = ?;
                    `, [assignment_id, Gallery.RATING.VERIFIED, Post.RATING.VERIFIED])
                    .transacting(trx)
            )
            .then(({ rows: [{ gallery_count, photo_count, video_count } = {}] = [] } = {}) =>
                NotificationController
                    .notify([
                        {
                            type: 'outlet-assignment-expired',
                            recipients: {
                                outlets: assignment.related('outlets').models
                            },
                            payload: {
                                sms: `${assignment.get('title')} has expired. In total, ${gallery_count} ${gallery_count === 1 ? 'gallery' : 'galleries'} with ${photo_count} ${photo_count === 1 ? 'photo' : 'photos'} and ${video_count} ${video_count === 1 ? 'video' : 'videos'} were submitted.`,
                                email: {
                                    subject: `${assignment.get('title')} has expired`,
                                    template_name: 'assignment',
                                    template_content: this.makeAssignmentEmail({
                                        assignment,
                                        operation: this.EMAIL_OPERATIONS.EXPIRED,
                                        info: `In total, ${gallery_count} ${gallery_count === 1 ? 'gallery' : 'galleries'} with ${photo_count} ${photo_count === 1 ? 'photo' : 'photos'} and ${video_count} ${video_count === 1 ? 'video' : 'videos'} were submitted.`
                                    })
                                }
                            }
                        },
                        {
                            type: 'user-dispatch-assignment-expired',
                            recipients: {
                                users: assignment.related('users').models
                            },
                            payload: {
                                push: {
                                    title: `${assignment.get('title')} has expired`,
                                    data: {
                                        assignment_id: hashids.encode(assignment.get('id'))
                                    }
                                },
                                fresco: {
                                    title: `${assignment.get('title')} has expired`,
                                    meta: {
                                        assignment_id: assignment.get('id')
                                    }
                                }
                            }
                        }
                    ])
                    .catch(reporter.report)
            )
            .catch(Assignment.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid assignment'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Send an email to an outlet with new content
     * @param {Integer}     assignment_id   The id of the assignment content was submitted for
     * @param {Integer}     outlet_id       The id of the outlet to send the email to
     * @param {Integer[]}   post_ids        List of posts that have been added to the assignment
     * @param {Boolean}     firstlook       Whether this outlet has firstlook for the given posts
     * @returns {Promise}
     */
    assignmentContentNotification({
        assignment_id,
        outlet_id,
        post_ids,
        firstlook
    } = {}) {

        let assignment_model, outlet_model, post_models;

        return Assignment
            .forge({ id: assignment_id })
            .fetch({
                withRelated: 'outlets',
                require: true
            })
            .then(assignment => {
                assignment_model = assignment;
                return Outlet
                    .forge({ id: outlet_id })
                    .fetch({ require: true });
            })
            .then(outlet => {
                outlet_model = outlet;
                return Post
                    .query(qb => {
                        qb.whereIn('id', post_ids);
                        if (!firstlook) {
                            Post.QUERIES.EXCLUSIVITY(qb, { outlet });
                        }
                    })
                    .fetchAll()
            })
            .then(post_collection => {
                post_models = post_collection.models;
                return send();
            })
            .catch(Assignment.NotFoundError, err => Promise.reject(ferror(ferror.NOT_FOUND).param('assignment_id').value(assignment_id)))
            .catch(Outlet.NotFoundError, err => Promise.reject(ferror(ferror.NOT_FOUND).param('outlet_id').value(outlet_id)))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function send() {
            let now = new Date();
            let filtered_ids = [];
            let kept_ids = [];
            let photo_count = 0, video_count = 0;
            for (let post_model of post_models) {
                // Skip posts where where first-look applies (submitted to an outlet, and uploaded less than 20 minutes ago [1.2e+6 is 20min in milliseconds])
                if (!firstlook && assignment_model.related('outlets').length > 1 && now.getTime() - post_model.get('created_at').getTime() < 1.2e+6) {
                    filtered_ids.push(post_model.get('id'));
                }
                else {
                    if (post_model.has('video')) video_count++;
                    else photo_count++;

                    kept_ids.push(post_model.get('id'));
                }
            }

            // If none of the posts are ready to be shown (firstlook is in effect), then retry the notification later
            if (!kept_ids.length) return sendResponse();

            return Gallery
                .query(qb => {
                    qb.select(Gallery.knex.raw('DISTINCT galleries.*'));
                    qb.innerJoin('posts', 'galleries.id', 'posts.parent_id');
                    qb.whereIn('posts.id', kept_ids);
                    Gallery.QUERIES.VISIBLE(qb, {outlet: outlet_model});
                })
                .fetchAll({
                    withRelated: {
                        posts: qb => Post.QUERIES.VISIBLE(qb, {outlet: outlet_model})
                    }
                })
                .then(gallery_collection => {
                    let gallery_models = gallery_collection.models;
                    let email_content = gallery_models.map(gallery => {
                        return NotificationController.Mediums.Email.createEmailGallery(gallery, {
                            type: 'email',
                            email_name: 'assignment-content',
                            assignment_id: hashids.encode(assignment_model.get('id'))
                        })
                    });

                    let content_str = "";
                    if (photo_count) {
                        content_str += `${photo_count} ${photo_count === 1 ? 'photo' : 'photos'}`;
                        if (video_count) content_str += ' and ';
                    }
                    if (video_count) {
                        content_str += `${video_count} ${video_count === 1 ? 'video' : 'videos'}`;
                    }

                    if (photo_count + video_count > 1) {
                        content_str += ' were';
                    }
                    else {
                        content_str += ' was';
                    }

                    let title_str = 'content';
                    if (photo_count === 0) {
                        title_str = video_count > 1 ? 'videos' : 'video';
                    }
                    else if (video_count === 0) {
                        title_str = photo_count > 1 ? 'photos' : 'photo';
                    }

                    let title = `New ${title_str} submitted to ${assignment_model.get('title')}`;

                    return NotificationController
                        .notify({
                            type: 'outlet-assignment-content',
                            recipients: {
                                outlets: [outlet_model]
                            },
                            payload: {
                                sms: `${content_str} submitted to ${assignment_model.get('title')}.`,
                                email: {
                                    subject: title,
                                    template_name: 'multi-gallery',
                                    template_content: [
                                        {
                                            name: 'galleries',
                                            content: email_content
                                        },
                                        {
                                            name: 'description',
                                            content: 'Here\'s the latest from ' + NotificationController.Mediums.Email.createEmailLink({
                                                link: `assignment/${hashids.encode(assignment_model.get('id'))}`,
                                                content: assignment_model.get('title'),
                                                referral: {
                                                    type: 'email',
                                                    email_name: 'assignment-content',
                                                    assignment_id: hashids.encode(assignment_model.get('id'))
                                                }
                                            })
                                        }
                                    ]
                                }
                            }
                        })
                        .then(sendResponse)
                        .catch(err => Promise.reject(ferror.constraint(err)));
                });

            function sendResponse() {
                // Re-schedule notification with the posts that were skipped this notification
                if (!firstlook && filtered_ids.length > 0) {
                    let key = `${assignment_id}-${outlet_id}`;
                    let type = 'outlet-assignment-content';
                    let delay = config.APPLICATION.DELAYS.ASSIGNMENT.STANDARD;
                    return {
                        slug: type,
                        key,
                        run_in: delay,
                        request: {
                            body: {
                                assignment_id,
                                outlet_id,
                                post_ids: filtered_ids
                            }
                        }
                    };
                }
                else {
                    return "OK";
                }
            }
        }
    }

    /**
     * Send an email to all outlets associated with an assignment when a user/users accept it
     * @param {Integer}     assignment_id   the assignment that has been accepted
     * @param {Integer[]}   user_ids        array of user ids who have accepted the assignmnet
     * @returns {Promise.<string>}
     */
    assignmentAcceptNotification({
        assignment_id,
        user_ids
    } = {}) {
        let user_id = user_ids[0];
        let other_user_count = user_ids.length - 1;

        let assignment = Assignment.forge({ id: assignment_id });
        let user = User.forge({ id: user_id });

        return assignment
            .fetch({ require: true, withRelated: ['outlets'] })
            .then(() => user.fetch({ require: true }))
            .then(() => {
                let others = '';
                if (other_user_count > 0) {
                    others = ` and ${other_user_count} other ${other_user_count > 1 ? 'users' : 'user'}`
                }

                let subject = `${assignment.get('title')}: ${user_ids.length > 1 ? user_ids.length + ' users' : 'A user'} accepted`;

                const assignment_link = NotificationController.Mediums.Email.createEmailLink({
                    link: `assignment/${hashids.encode(assignment.get('id'))}`,
                    anchor: false,
                    referral: {
                        type: 'email',
                        email_name: 'assignment-accepted',
                        assignment_id: hashids.encode(assignment.get('id'))
                    }
                })

                return NotificationController.notify({
                    type: 'outlet-assignment-accepted',
                    recipients: {
                        outlets: assignment.related('outlets').models
                    },
                    payload: {
                        email: {
                            subject,
                            template_name: 'assignment-accepted',
                            template_content: [
                                {
                                    name: 'user',
                                    content: user.name()
                                },
                                {
                                    name: 'others',
                                    content: others
                                },
                                {
                                    name: 'link',
                                    content: assignment_link
                                },
                                {
                                    name: 'assignment_title',
                                    content: assignment.get('title')
                                }
                            ]
                        }
                    }
                });
            })
            .then(() => "OK")
            .catch(Assignment.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg(`Assignment ${assignment_id} not found`)))
            .catch(User.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg(`User ${user_id} not found`)))
    }

    /**
     * Generates template content needed for an assignment email
     * @param {Model}   assignment      The assignment that the email is for
     * @param {Model}   old_assignment  (Optional) The original assignment. Only applicable for operation=MERGED
     * @param {String}  operation       The operation that the email is for. Should be one of the enum EMAIL_OPERATIONS
     * @param {String}  info            (Optional) Any additional information you would like to send to the user, as an HTML string
     * @returns {Array} template_content for the email
     */
    makeAssignmentEmail({
        assignment,
        old_assignment,
        operation,
        info
    } = {}) {

        let staticMap = '';

        if (assignment.has('location')) {
            let lat = assignment.get('location').coordinates[1];
            let lng = assignment.get('location').coordinates[0];
            let radius = assignment.get('radius');

            let location = `${lat},${lng}`;

            let fillcolor = '';
            let icon = '';

            if (operation == this.EMAIL_OPERATIONS.SUBMITTED) {
                fillcolor = '0xb3b3b34d';
                icon = 'http://cdn.static.fresconews.com/images/email/assignment-pending32.png';
            }
            if (operation == this.EMAIL_OPERATIONS.APPROVED || operation == this.EMAIL_OPERATIONS.MERGED) {
                fillcolor = '0xffc6004d';
                icon = 'http://cdn.static.fresconews.com/images/email/assignment-active32.png';

                //Special case title for merged assignment emails
                if (operation == this.EMAIL_OPERATIONS.MERGED) {
                    operation = `${old_assignment.get('title')} was approved and merged with the assignment`
                }
            }
            else if (operation == this.EMAIL_OPERATIONS.EXPIRED || operation == this.EMAIL_OPERATIONS.REJECTED) {
                fillcolor = '0xd0021b4d';
                icon = 'http://cdn.static.fresconews.com/images/email/assignment-expired32.png';
            }

            let polyline = polylineCircle(lat, lng, radius);

            staticMap = `https://maps.googleapis.com/maps/api/staticmap?size=400x400&center=${location}&`;
            staticMap += `markers=anchor:center|icon:${icon}|${location}&`;
            staticMap += `path=color:0x00000000|fillcolor:${fillcolor}|enc:${polyline}`;
        }

        const assignment_link = NotificationController.Mediums.Email.createEmailLink({
            link: `assignment/${hashids.encode(assignment.get('id'))}`,
            anchor: false,
            referral: {
                type: 'email',
                email_name: `assignment-${operation}`
            }
        });

        return [
            {
                name: 'operation',
                content: operation
            },
            {
                name: 'link',
                content: assignment_link
            },
            {
                name: 'assignment_title',
                content: assignment.get('title')
            },
            {
                name: 'caption',
                content: assignment.get('caption')
            },
            {
                name: 'info',
                content: info
            },
            {
                name: 'static_map',
                content: staticMap
            },
            {
                name: 'local',
                content: assignment.has('location')
            }
        ]
    }
}

module.exports = new AssignmentNotificationController();
module.exports.EMAIL_OPERATIONS = {
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    MERGED: 'merged',
    EXPIRED: 'expired'
};

const NotificationController = require('../index');
