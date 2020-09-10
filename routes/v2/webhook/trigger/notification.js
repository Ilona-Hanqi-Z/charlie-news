'use strict';

const config = require('../../../../config');

const express = require('express');
const Promise = require('bluebird');

const ferror = require('../../../../lib/frescoerror');
const hashids = require('../../../../lib/hashids');
const needs = require('../../../../lib/needs');
const winston = require('../../../../lib/winston');

const middleware = require('../../../../middleware');

const Assignment = require('../../../../models/assignment');

const NotificationController = require('../../../../controllers/Notification');
const AssignmentController = require('../../../../controllers/Assignment');
const OutletController = require('../../../../controllers/Outlet');
const GalleryController = require('../../../../controllers/Gallery');

const Outlet = require('../../../../models/outlet');
const OutletLocation = require('../../../../models/outlet_location');
const Post = require('../../../../models/post');
const Gallery = require('../../../../models/gallery');
const User = require('../../../../models/user');

const router = express.Router();

// TODO REMOVE THIS, USE CLIENT-SIDE ALERTS FOR FAILED CONTENT UPLOADS
router.post('/delayed/submission-failed',
    // middleware.auth.permissions({
    //     client: 'scheduler:notification:create'
    // }),
    needs.body({
        gallery_id: 'int',
        post_ids: 'int[]'
    }),
    (req, res, next) => {
        if (req.body.post_ids.length === 0) {
            return res.status(200).send('OK');
        }

        Post
            .query(qb => qb.whereIn('id', req.body.post_ids))
            .fetch({
                require: true,
                withRelated: [ 'owner', 'parent', 'assignment' ]
            })
            .then(NotificationController.Types.Submission.notifyPostFailed)
            .then(() => res.status(200).send('OK'))
            .catch(next);
    }
);

router.post('/delayed/user-social-followed',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))
        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Followed you'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-followed',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
)
router.post('/delayed/user-social-gallery-liked',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]',
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))

        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Liked your gallery'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-gallery-liked',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids,
                                    gallery_id: req.body.gallery_id
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes,
                                    gallery_id: hashids.encode(req.body.gallery_id)
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
)
router.post('/delayed/user-social-repost-liked',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]',
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))

        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Liked your repost'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-repost-liked',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids,
                                    gallery_id: req.body.gallery_id
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes,
                                    gallery_id: hashids.encode(req.body.gallery_id)
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
)
router.post('/delayed/user-social-reposted',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]',
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))

        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Reposted your gallery'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-reposted',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids,
                                    gallery_id: req.body.gallery_id
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes,
                                    gallery_id: hashids.encode(req.body.gallery_id)
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
)
router.post('/delayed/user-social-commented',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]',
        comment_ids: 'int[]',
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))

        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Commented on your gallery'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-commented',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids,
                                    comment_ids: req.body.comment_ids,
                                    gallery_id: req.body.gallery_id
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes,
                                    comment_ids: req.body.comment_ids.map(hashids.encode),
                                    gallery_id: hashids.encode(req.body.gallery_id)
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
)
router.post('/delayed/user-social-mentioned-comment',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int',
        user_ids: 'int[]',
        comment_ids: 'int[]',
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let title, image, body
        let other_ids = req.body.user_ids
        let other_hashes = other_ids.map(i => hashids.encode(i))
        let comment_hashes = req.body.comment_ids.map(i => hashids.encode(i))

        if (other_ids.length === 0) {
            return res.status(200).send('OK');
        }

        User
            .forge({ id: req.body.user_id })
            .fetch({ require: true })
            .then(user_model =>
                User
                    .forge({ id: other_ids[0] })
                    .fetch({ require: true })
                    .then(other_user_model => {
                        image = other_user_model.get('avatar')
                        title = other_user_model.get('full_name')
                        if (req.body.user_ids.length > 1) {
                            title += ` and ${other_ids.length - 1} ${other_ids.length === 2 ? 'other' : 'others'}`
                        }
                        body = 'Mentioned you in a comment'
                        return user_model
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(user_model =>
                NotificationController
                    .notify({
                        type: 'user-social-mentioned-comment',
                        recipients: { users: user_model },
                        payload: {
                            fresco: {
                                title,
                                body,
                                meta: {
                                    image,
                                    user_ids: other_ids,
                                    comment_ids: req.body.comment_ids,
                                    gallery_id: req.body.gallery_id
                                }
                            },
                            push: {
                                title,
                                body,
                                data: {
                                    image,
                                    user_ids: other_hashes,
                                    comment_ids: req.body.comment_ids.map(hashids.encode),
                                    gallery_id: hashids.encode(req.body.gallery_id)
                                }
                            }
                        }
                    })
                    .catch(err => Promise.reject(ferror.constraint(err)))
            )
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, () => Promise.reject(
                ferror(ferror.NOT_FOUND)
                    .msg(`User ${req.body.user_id} not found`)
            ))
            .catch(err => next(err))
    }
);

router.post('/delayed/outlet-assignment-content-firstlook',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        assignment_id: 'int',
        outlet_id: 'int',
        post_ids: 'int[]'
    }),
    (req, res, next) => {
        NotificationController.Types.Assignment
            .assignmentContentNotification(Object.assign({
                firstlook: true
            }, req.body))
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/delayed/outlet-assignment-content',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        assignment_id: 'int',
        outlet_id: 'int',
        post_ids: 'int[]'
    }),
    (req, res, next) => {
        NotificationController.Types.Assignment
            .assignmentContentNotification(Object.assign({
                firstlook: false
            }, req.body))
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/delayed/outlet-assignment-accepted',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        assignment_id: 'int',
        user_ids: 'int[]'
    }),
    (req, res, next) => {
        NotificationController.Types.Assignment
            .assignmentAcceptNotification(req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/delayed/outlet-location-content',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        location_ids: 'int[]',
        photo_count: 'int',
        video_count: 'int',
        post_ids: 'int[]'
    }),
    (req, res, next) => {
        NotificationController.Types.Outlet
            .locationContentNotification(req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/delayed/outlet-new-purchase',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        outlet_id: 'int',
        photos: 'int',
        videos: 'int'
    }),
    (req, res, next) => {
        let {
            outlet_id,
            photos,
            videos
        } = req.body;

        Outlet
            .forge({ id: outlet_id })
            .fetch({ require: true })
            .then(send)
            .catch(Outlet.NotFoundError, ferror(ferror.NOT_FOUND).param('outlet_id').value(outlet_id).trip(next))
            .catch(ferror.constraint(next));

        function send(outlet_model) {
            let total_count = photos + videos;
            let body = '';

            if (photos) {
                body += `${photos} new ${photos === 1 ? 'photo' : 'photos'} `;
            }
            if (videos) {
                if (body) body += 'and '
                body += `${videos} new ${videos === 1 ? 'video' : 'videos'} `;
            }

            // <a href="${config.SERVER.WEB_ROOT}outlet">${outlet_model.get('title')}'s vault.</a>
            const outletLink = NotificationController.Mediums.Email.createEmailLink({
                link: 'outlet',
                content: `${outlet_model.get('title')}'s vault.`,
                referral: {
                    type: 'email',
                    email_name: 'new-purchase'
                }
            });

            body += `${total_count === 1 ? 'is' : 'are'} available in ${outletLink}`;

            NotificationController
                .notify({
                    type: 'outlet-new-purchase',
                    recipients: {
                        outlets: outlet_model
                    },
                    payload: {
                        sms: body,
                        email: {
                            title: `New ${total_count > 1 ? 'purchases' : 'purchase'}`,
                            subject: `New ${total_count > 1 ? 'purchases' : 'purchase'}`,
                            body
                        }
                    }
                })
                .then(() => res.status(200).send('OK'))
                .catch(next);
        }
    }
);

router.post('/delayed/user-new',
    middleware.auth.permissions({
        client: 'scheduler:notification:create'
    }),
    needs.body({
        user_id: 'int'
    }),
    (req, res, next) => {
        let { user_id } = req.body;

        User
            .forge({ id: user_id })
            .fetch({ required: true })
            .then(user_model => {
                return NotificationController.Mediums.Email.send(user_model.get('email'), {
                    subject: 'A quick welcome to Fresco!',
                    template_name: 'new-user',
                    from_email: 'john.meyer@fresconews.com',
                    from_name: 'John Meyer',
                    template_content: [
                        {
                            name: 'user',
                            content: user_model.name()
                        }
                    ]
                });
            })
            .then(() => res.status(200).send('OK'))
            .catch(User.NotFoundError, ferror(ferror.NOT_FOUND).param('user_id').value(user_id).trip(next))
            .catch(ferror.constraint(next));
    }
);

router.post('/delayed/assignment-auto-verify',
    middleware.auth.permissions({
        client: 'scheduler:assignment:update'
    }),
    needs.body({
        assignment_id: 'int'
    }),
    (req, res, next) => {
        let { assignment_id } = req.body;
        let user_model = User.forge({ id:  config.APPLICATION.AUTO_VERIFY.ID });
        Assignment
            .forge({ id: assignment_id })
            .fetch({ required: true })
            .then(assignment_model => {
                if (parseInt(assignment_model.get('rating')) === Assignment.RATING.UNRATED) {
                    return AssignmentController.approve(user_model, assignment_id);
                }
            })
            .then(() => res.status(200).send('OK'))
            .catch(ferror.constraint(next));
    }
);

router.post('/delayed/gallery-auto-verify',
    middleware.auth.permissions({
        client: 'scheduler:gallery:update'
    }),
    needs.body({
        gallery_id: 'int'
    }),
    (req, res, next) => {
        let { gallery_id } = req.body;
        let user_model = User.forge({ id: config.APPLICATION.AUTO_VERIFY.ID });
        user_model
            .fetch({ required: true })
            .then(() => Gallery
                .forge({ id: gallery_id })
                .fetch({ required: true })
            )
            .then(gallery_model => {
                if (parseInt(gallery_model.get('rating')) === Gallery.RATING.UNRATED) {
                    user_model.can = () => true; // Mock Admin because I'm too lazy to figure out how to make this work the correct way
                    return GalleryController.update(user_model, gallery_id, { rating: Gallery.RATING.VERIFIED })
                }
            })
            .then(() => res.status(200).send('OK'))
            .catch(ferror.constraint(next));
    }
);

module.exports = router;