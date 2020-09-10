'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const superagent = require('superagent');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const twitter = require('../../lib/twitter');
const hashids = require('../../lib/hashids');
const reporter = require('../../lib/reporter');
const scheduler = require('../../lib/scheduler');

const Comment = require('../../models/comment');
const Gallery = require('../../models/gallery');
const GalleryLike = require('../../models/gallery_like');
const GalleryReport = require('../../models/gallery_report');
const GalleryRepost = require('../../models/gallery_repost');
const User = require('../../models/user');

/**
 * Class container for gallery methods realted to social models e.g. likes, reposts
 */
class GallerySocialController {

    /**
     * Likes a passed gallery for the passed user model
     */
    like(user_model, gallery_id, repost_id, trx) {
        let gallery_model = Gallery.forge({ id: gallery_id })
        let repost_model = GalleryRepost.forge({ id: repost_id })

        return (
            repost_id
                ? repost_model
                    .fetch({
                        require: true,
                        transacting: trx
                    })
                : Promise
                    .resolve()
            )
            .then(() =>
                gallery_model.fetch({
                    require: true,
                    transacting: trx
                })
            )
            .then(() =>
                GalleryLike
                    .where({
                        user_id: user_model.get('id'),
                        gallery_id: gallery_model.get('id')
                    })
                    .save({
                        active: true,
                        action_at: new Date()
                    }, {
                        patch: true,
                        transacting: trx
                    })
                    .catch(GalleryLike.NoRowsUpdatedError, () =>
                        new GalleryLike({
                            user_id: user_model.get('id'),
                            gallery_id: gallery_model.get('id')
                        })
                        .save(null, { method: 'insert', transacting: trx })
                        .then(notify)
                    )
            )
            .then(() => Promise.resolve({ success: 'ok'}))
            .catch(Gallery.NotFoundError, () => Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Gallery not found')))
            .catch(GalleryReport.NotFoundError, () => Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Repost not found')))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notify() {
            if (gallery_model.has('owner_id') && gallery_model.get('owner_id') !== user_model.get('id')) {
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'user-social-gallery-liked',
                        key: gallery_model.get('id'),
                        delay: config.APPLICATION.DELAYS.SOCIAL,
                        fields: {
                            user_id: gallery_model.get('owner_id'),
                            user_ids: [user_model.get('id')],
                            gallery_id: gallery_model.get('id')
                        },
                        behaviors: {
                            $push: ['user_ids']
                        }
                    })
                    .catch(reporter.report); // Swallow errors so other notifs can send despite failures
            }
            if (repost_model.has('user_id')) {
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'user-social-repost-liked',
                        key: repost_model.get('user_id'),
                        delay: config.APPLICATION.DELAYS.SOCIAL,
                        fields: {
                            user_id: repost_model.get('user_id'),
                            user_ids: [user_model.get('id')],
                            gallery_id: gallery_model.get('id')
                        },
                        behaviors: {
                            $push: ['user_ids']
                        }
                    })
                    .catch(reporter.report); // Swallow errors so other notifs can send despite failures
            }
        }
    }

    /**
     * Unlike a previously liked gallery.
     * 
     * Does not delete row, but sets it as inactive.
     * This function will handle any potential scheduled notifications involving this gallery
     * 
     * @param {UserModel} user_model 
     * @param {number} gallery_id 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise} 
     */
    unlike(user_model, gallery_id, trx) {
        return GalleryLike
            .where({
                user_id: user_model.get('id'),
                gallery_id: gallery_id
            })
            .save({
                active: false,
                action_at: new Date()
            }, {
                patch: true,
                transacting: trx
            })
            .then(() => scheduler.get('user-social-gallery-liked', gallery_id))
            .then(schedule => {
                if (!schedule) return;

                let body = schedule.request.body;
                body.user_ids = body.user_ids.filter(uid => uid != user_model.get('id'));

                return scheduler.update(schedule, { request: { body } });
            })
            .then(() => Promise.resolve({ success: 'ok'}))
            .catch(GalleryLike.NoRowsUpdatedError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('You have not liked that gallery!'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Retrieves a list of the likes for a passed gallery
     */
    likes(user_model, gallery_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}) {
        if (!gallery_id) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing gallery ID!')
            );
        }

        return User
            .query(qb => {
                qb.innerJoin('gallery_likes', 'user_id', 'users.id');
                qb.where('gallery_likes.active', true);
                qb.where('gallery_likes.gallery_id', gallery_id);
                User.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll()
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    repost(user_model, gallery_id, trx) {

        if (user_model.isSuspended()) {
            return Promise.reject(ferror(ferror.FORBIDDEN).msg('User suspended'));
        }

        return new Promise((resolve, reject) => {
            let gallery_model = Gallery.forge({ id: gallery_id });
            gallery_model
                .fetch({
                    require: true,
                    transacting: trx
                })
                .then(() => {
                    if(gallery_model.get('owner_id') === user_model.get('id')) {
                        return reject(
                            ferror(ferror.INVALID_REQUEST)
                                .msg('You cannot repost your own gallery!')
                        );
                    }
                    repost();
                })
                .catch(Gallery.NotFoundError, ferror(ferror.NOT_FOUND).trip(reject))
                .catch(ferror.constraint(reject));

            function repost() {
                GalleryRepost
                    .forge({
                        user_id: user_model.get('id'),
                        gallery_id: gallery_model.get('id')
                    })
                    .save(null, { transacting: trx })
                    .then(r => resolve({ success: 'ok' }))
                    .then(notify)
                    .catch(ferror.constraint(reject));
            }
            
            function notify() {
                if (gallery_model.has('owner_id')) NotificationController.Mediums.Delayed
                    .send({
                        type: 'user-social-reposted',
                        key: gallery_model.get('id'),
                        delay: config.APPLICATION.DELAYS.SOCIAL,
                        fields: {
                            user_id: gallery_model.get('owner_id'),
                            user_ids: [user_model.get('id')],
                            gallery_id: gallery_model.get('id')
                        },
                        behaviors: {
                            $push: ['user_ids']
                        }
                    })
                    .catch(reporter.report); // Swallow errors so other notifs can send despite failures
            }
        });
    }

    unrepost(user_model, gallery_id) {
        return new Promise((resolve, reject) => {
            Gallery
                .query(qb => {
                    qb.where('id', gallery_id);
                })
                .fetch()
                .then(g => {
                    if(!g) return reject(ferror(ferror.INVALID_REQUEST).msg('Unable to unrepost a nonexistent gallery!'));
                    unrepost();
                })
                .catch(ferror.constraint(reject));

            function unrepost() {
                GalleryRepost
                    .where({
                        user_id: user_model.get('id'),
                        gallery_id: gallery_id
                    })
                    .destroy()
                    .then(r => resolve({ success: 'ok' }))
                    .catch(ferror.constraint(reject));
            }
        });
    }

    /**
     * Retrieves a list of the reposts for a passed gallery
     */
    reposts(user_model, gallery_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}) {
        if (!gallery_id) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing gallery ID')
            );
        }

        return User
            .query(qb => {
                qb.innerJoin('gallery_reposts', 'user_id', 'users.id');
                qb.where('gallery_reposts.gallery_id', gallery_id);
                User.paginate(qb, { sortBy, direction, limit, last, page });
            })
            .fetchAll()
            .then(coll => Promise.resolve(coll.models))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Retrieves the comments for a passed gallery
     */
    comments(user_model, gallery_id, { sortBy = 'id', direction = 'desc', last, page, limit = 20 } = {}) {
        return new Promise((resolve, reject) => {
            Comment
                .query(qb => {
                    qb.where('gallery_id', gallery_id);
                    qb.innerJoin('gallery_comments', 'comments.id', 'gallery_comments.comment_id');
                    qb.where('gallery_comments.gallery_id', gallery_id);
                    if (user_model) {
                        User.QUERIES.BLOCKING_FILTER(qb, { user: user_model, column: 'comments.user_id' });
                    }
                    Comment.paginate(qb, { sortBy, direction, last, page, limit });
                })
                .fetchAll()
                .then(coll => resolve(coll.models))
                .catch(ferror.constraint(reject));
        });
    }

    /**
     * Creates a comment on the passed gallery
     */
    comment(user_model, gallery_id, comment, trx) {
        let gallery_model = Gallery.forge({ id: gallery_id });

        if (user_model.isSuspended()) {
            return Promise.reject(ferror(ferror.FORBIDDEN).msg('User suspended'));
        }

        return gallery_model
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Gallery.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('Gallery not found')))
            .catch(err => Promise.reject(ferror.constraint(err)))
            .then(() => CommentController.make(user_model, comment, trx))
            .then(comment_model =>
                comment_model
                    .gallery()
                    .attach(gallery_model, { transacting: trx })
                    .then(() => Promise.resolve(comment_model))
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
            .then(comment_model => {
                if (gallery_model.get('owner_id') !== user_model.get('id')) {
                    notify(comment_model)
                }

                return Promise.resolve(comment_model)
            });

        function notify(comment_model) {
            let user_entities = comment_model.get('entities').filter(e => e.entity_type === 'user')
            Promise.all([
                gallery_model.has('owner_id') && gallery_model.get('owner_id') != user_model.get('id') // Notify content owner of comment
                    ? NotificationController.Mediums.Delayed
                        .send({
                            type: 'user-social-commented',
                            key: gallery_model.get('id'),
                            delay: config.APPLICATION.DELAYS.SOCIAL,
                            fields: {
                                user_id: gallery_model.get('owner_id'),
                                user_ids: [user_model.get('id')],
                                comment_ids: [comment_model.get('id')],
                                gallery_id: gallery_model.get('id')
                            },
                            behaviors: {
                                $push: ['user_ids', 'comment_ids']
                            }
                        })
                        .catch(reporter.report)
                    : Promise.resolve(),
                user_entities.length > 0 // Notify mentioned users of comment
                    ? Promise.each(user_entities, entity =>
                        NotificationController.Mediums.Delayed
                            .send({
                                type: 'user-social-mentioned-comment',
                                key: entity.entity_id,
                                delay: config.APPLICATION.DELAYS.SOCIAL,
                                fields: {
                                    user_id: entity.entity_id,
                                    user_ids: [user_model.get('id')],
                                    comment_ids: [comment_model.get('id')],
                                    gallery_id: gallery_model.get('id')
                                },
                                behaviors: {
                                    $push: ['user_ids', 'comment_ids']
                                }
                            })
                            .catch(reporter.report)
                    )
                    : Promise.resolve()
            ])
        }
    }

    /**
     * Delets a comment for the passed comment ID
     */
    uncomment(user_model, comment_id, trx) {
        return new Promise((resolve, reject) => {
            let params = { id: comment_id };

            if (!user_model.can('admin', 'delete', 'gallery-comment')) {
                params.user_id = user_model.get('id');
            }

            Comment
                .forge(params)
                .destroy({ require: true, transacting: trx })
                .then(c => resolve({ success: 'ok' }))
                .catch(Comment.NoRowsDeletedError, ferror(ferror.NOT_FOUND)
                    .msg('Comment not found')
                    .param('comment_id')
                    .value(comment_id)
                    .trip(reject)
                )
                .catch(ferror.constraint(reject));
        });
    }
    
}

module.exports = new GallerySocialController;

// Controller definitions go here to avoid circular relationships
const NotificationController = require('../Notification');
const CommentController = require('../Comment');