'use strict';

const config = require('../../../config/index');
const ferror = require('../../../lib/frescoerror');
const hashids = require('../../../lib/hashids');
const reporter = require('../../../lib/reporter');

/**
 * Post Notification Controller
 * Handles all notifications regarding posts.
 */
class PurchaseNotificationController {

    /**
     * Notifies outlet members of a new purchase being available
     * 
     * @param {UserModel} purchase_model    purchase model, with the following relations
     *                                      loaded when applicable: user, assignment,
     *                                      outlet, post, post.owner
     * 
     * @returns {Promise}
     */
    notifyOutletNewPurchase(purchase) {
        let outlet_id = purchase.related('outlet').get('id');
        let is_video = purchase.related('post').has('stream');

        return NotificationController.Mediums.Delayed
            .send({
                delay: 60 * 10, // 10 min
                type: 'outlet-new-purchase',
                key: outlet_id,
                fields: {
                    outlet_id,
                    videos: is_video ? 1 : 0,
                    photos: is_video ? 0 : 1
                },
                behaviors: {
                    $inc: ['video', 'photo'],
                    $push: ['post_ids']
                }
            })
            .catch(reporter.report);
    }

    /**
     * Notifies slack of a new purchase
     * 
     * @param {UserModel} purchase_model    purchase model, with the following relations
     *                                      loaded when applicable: user, assignment,
     *                                      outlet, post, post.owner
     * 
     * @returns {Promise}
     */
    notifySlackNewPurchase(purchase) {
        let post = purchase.related('post');
        let owner = post.related('owner');
        let assignment = purchase.related('assignment');
        let outlet = purchase.related('outlet');
        let user = purchase.related('user');
        let message = owner.isNew()
            ? 'Imported'
            : `<${config.SERVER.WEB_ROOT}user/${hashids.encode(owner.get('id'))}|_${owner.name()}_>'s`;
        message += ` <${config.SERVER.WEB_ROOT}post/${hashids.encode(post.get('id'))}|*`;
        message += post.has('stream') ? 'Video' : 'Photo';
        message += '*> purchased by ';
        message += `<${config.SERVER.WEB_ROOT}user/${hashids.encode(user.get('id'))}|${user.name()}> `
        message += `from the outlet <${config.SERVER.WEB_ROOT}outlet/${hashids.encode(outlet.get('id'))}|_${outlet.get('title')}_>!`;

        if (!assignment.isNew()) {
            message += '\nPurchase made from assignment: '
            message += `<${config.SERVER.WEB_ROOT}assignment/${hashids.encode(assignment.get('id'))}|_${assignment.get('title')}_>`;
        }

        return NotificationController.Mediums.Slack
            .send({
                message,
                channel: config.SLACK.CHANNELS.PURCHASES
            })
            .catch(reporter.report);
    }

    /**
     * Notifies purchased content owner of the transaction
     * 
     * @param {UserModel} purchase_model    purchase model, with the following relations
     *                                      loaded when applicable: user, assignment,
     *                                      outlet, post, post.owner
     * 
     * @returns {Promise}
     */
    notifyUserNewPurchase(purchase) {
        let post_model = purchase.related('post');
        let outlet_model = purchase.related('outlet');
        let owner_model = post_model.related('owner');
        let payment_model = owner_model.related('active_payment');
        let amount = purchase.get('amount') - purchase.get('fee');

        amount = parseFloat(amount / 100).toFixed(2);

        if (owner_model.isNew()) return; // Ignore if the post has no owner;

        let has_payment = !payment_model.isNew()
        let type_of_post = post_model.has('stream') ? 'video' : 'photo'
        let title = `Your ${type_of_post} was purchased!`;
        let body = `${outlet_model.get('title')} purchased your ${type_of_post}! `

        if (has_payment) {
            body += `We've sent $${amount} to ${payment_model.getName()}.`
        } else {
            body += `Add a payment method to get paid $${amount}.`
        }

        // Notify users
        return NotificationController
            .notify({
                type: 'user-dispatch-purchased',
                recipients: { users: owner_model },
                payload: {
                    fresco: {
                        title,
                        body,
                        meta: {
                            post_id: post_model.get('id'),
                            gallery_id: post_model.get('parent_id'),
                            outlet_id: outlet_model.get('id'),
                            image: post_model.get('image'),
                            has_payment
                        }
                    },
                    push: {
                        title,
                        body,
                        data: {
                            post_id: hashids.encode(post_model.get('id')),
                            gallery_id: hashids.encode(post_model.get('parent_id')),
                            outlet_id: hashids.encode(outlet_model.get('id')),
                            image: post_model.get('image'),
                            has_payment
                        }
                    }
                }
            })
            .catch(reporter.report);
    }
}

module.exports = new PurchaseNotificationController;

const NotificationController = require('../index');