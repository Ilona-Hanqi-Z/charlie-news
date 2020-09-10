'use strict';

const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const hashids = require('../../../lib/hashids');
const Post = require('../../../models/post');
const Promise = require('bluebird');
const reporter = require('../../../lib/reporter');

/**
 * Post Notification Controller
 * Handles all notifications regarding posts.
 */
class SubmissionNotificationController {

    /**
     * Used to start a delayed timer for alerting admins of failed uploads
     * 
     * TODO: Remove this functionality completely when client-side upload failure management is implemented
     * 
     * @param {number} gallery_id
     * @param {number[]} post_ids
     */
    initUploadFailedAlert(gallery_id, post_ids = []) {
        if (post_ids.length === 0) {
            return Promise.resolve();
        }

        return NotificationController.Mediums.Delayed
            .send({
                type: 'submission-failed',
                key: gallery_id,
                delay: 420, // 5 min
                fields: {
                    gallery_id,
                    post_ids
                }
            })
            .catch(reporter.report); // Swallow errors so other notifs can send despite failures
    }

    /**
     * Requires post_model with ATTACHED related parent, owner, and assignment (if applicable)
     * Asynchronously posts to slack if this is the first post of a gallery that has been processed.
     * 
     * @param {PostModel} post_model
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    notifyPostComplete(post_model, trx) {
        // Skip for non-organic content
        if (!post_model.has('owner_id')) {
            return Promise.resolve();
        }

        return Post.knex
            .select(Post.knex.raw('COUNT(*) AS count'))
            .from('posts')
            .where('parent_id', post_model.get('parent_id'))
            .where('status', Post.STATUS.COMPLETE)
            .transacting(trx)
            .then(model => {
                if (model[0].count != 1) return; // Only notify if we are the first post
                
                let user_model = post_model.related('owner');
                let gallery_model = post_model.related('parent');
                let assignment_model = post_model.related('assignment');

                let payload = `<${config.SERVER.WEB_ROOT}gallery/${hashids.encode(gallery_model.get('id'))}|*New Submission*> from ${user_model.get('full_name') || user_model.get('username')}!`;

                if (!assignment_model.isNew()) {
                    payload += `\n*Assignment:* <${config.SERVER.WEB_ROOT}assignment/${hashids.encode(assignment_model.get('id'))}|${assignment_model.get('title')}> <!channel>`;
                }

                return NotificationController.Mediums.Slack.send({
                    message: payload,
                    channel: config.SLACK.CHANNELS.SUBMISSIONS
                });
            });
    }

    /**
     * Notifies the Slack channel whenever a post fails to upload to Fresco.
     * 
     * NOTE: This will trigger if at least 1 of the posts in the gallery fails.
     * Therefore, the gallery will still contain the successful uploads and will
     * behave as a valid gallery, minus the failed content
     * 
     * @param {Model<Gallery>} post_model this model MUST have the following relations resolved:
     *                                      parent, owner, assignment
     * 
     * @returns {Promise}
     */
    notifyPostFailed(post_model) {
        let gallery_model = post_model.related('parent');
        let assignment_model = post_model.related('assignment');
        let owner_model = post_model.related('owner');

        // if post doesn't have a parent gallery or an owner, quit
        if (gallery_model.isNew() || owner_model.isNew()) {
            return Promise.resolve();
        }

        let message = `*Submission Failed:* One or more posts in `;

        message += `<${config.SERVER.WEB_ROOT}user/${hashids.encode(owner_model.get('id'))}|`;
        if (owner_model.name().slice(-1).toLowerCase === 's') {
            message += owner_model.name() + ">' ";
        } else {
            message += owner_model.name() + ">'s ";
        }

        message += `<${config.SERVER.WEB_ROOT}gallery/${hashids.encode(gallery_model.get('id'))}|*gallery*> have failed to upload `;

        if (!assignment_model.isNew()) {
            message += `(Assignment: <${config.SERVER.WEB_ROOT}assignment/${hashids.encode(assignment_model.get('id'))}|*${assignment_model.get('title')}*>) `;
        }

        return NotificationController.Mediums.Slack.send({
            channel: config.SLACK.CHANNELS.SUBMISSIONS_FAILED,
            message: message + '<!channel>'
        });
    }

    /**
     * Updates the scheduled event which tracks failed uploads for the given
     * gallery. Pulls the given post id from the list of unuploaded posts kept
     * by the scheduler.
     * 
     * TODO: Remove this functionality completely when client-side upload failure management is implemented
     * 
     * @param {number} gallery_id parent gallery id of post
     * @param {number} post_id
     * 
     * @returns {Promise}
     */
    updateUploadFailedAlert(gallery_id, post_id) {
        return NotificationController.Mediums.Delayed
            .send({
                type: 'submission-failed',
                key: gallery_id,
                fields: {
                    gallery_id,
                    post_ids: [post_id]
                },
                behaviors: {
                    $pull: ['post_ids']
                }
            })
            .catch(reporter.report); // Swallow errors so other notifs can send despite failures
    }
}

module.exports = new SubmissionNotificationController;

const NotificationController = require('../index');