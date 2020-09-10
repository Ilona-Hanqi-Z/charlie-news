'use strict';

const AWS = require('aws-sdk');
const Promise = require('bluebird');

const config = require('../config');

const ferror = require('../lib/frescoerror');
const hashids = require('../lib/hashids');
const reporter = require('../lib/reporter');

const Gallery = require('../models/gallery');
const Post = require('../models/post');
const Recap = require('../models/recap');

const S3 = new AWS.S3();

class SubmissionsController {

    /**
     * Create new upload signed urls
     * 
     * @param type {string}
     * @param params {object}
     * 
     * @returns Promise
     */
    createURLs(type = 'import', params) {
        return AWSController.generateUploadURLs(type, params);
    }

    /**
     * Creates new multipart upload and returns signed urls.
     *
     * @param params.gallery_id
     * @param params.assignment_id
     * @param params.post_id
     * @param params.contentType
     * @param params.fileSize
     * @param params.chunkSize
     * @returns {Promise}
     */
    // createSubmissionURLs(params) {
    //     return AWSController.generateUploadURLs('submission', params);
    // }

    /**
     * Creates new putObject signed URL for each post
     *
     * @param params.gallery_id
     * @param params.post_id
     * @param params.contentType
     *
     * @returns {*}
     */
    // createImportURLs(params) {
    //     return AWSController.generateUploadURLs('import', params);
    // }

    /**
     * Completes multipart upload, and assembles parts. Triggers lambda.
     *
     * @param key
     * @param uploadId
     * @param tags
     * @returns {*}
     */
    completeSubmission(user_model, { key, uploadId, eTags } = {}) {
        return new Promise((resolve, reject) => {
            if(!Array.isArray(eTags)) return reject(ferror(ferror.INVALID_REQUEST).msg('eTags must be an Array.'));
            S3.completeMultipartUpload({
                Bucket: config.AWS.S3.BUCKET,
                Key: config.AWS.S3.UPLOAD_DIRECTORY + key,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: eTags.map((t, i) => {
                        return {
                            ETag: t,
                            PartNumber: i + 1
                        }
                    })
                }
            }, (err, data) => {
                if (err) reject(ferror(err).type(ferror.INVALID_REQUEST));
                else resolve(data);
            });
        });
    }

    photoCompleteCallback(post_id, { width, height, key = false } = {}, trx) {
        let image
        if (key) {
            image = config.AWS.CLOUDFRONT.PHOTO_URL + key
        }

        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                transacting: trx,
                withRelated: ['assignment', 'parent', 'owner']
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PROCESSING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Photo is not being processed')
                    )
                }

                return post_model
                    .save({
                        status: Post.STATUS.COMPLETE,
                        width,
                        height,
                        image
                    }, {
                        patch: true,
                        transacting: trx
                    })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.notifyPostComplete(post_model, trx);
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    photoProcessingCallback(post_id, trx) {
        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PENDING && post_model.get('status') !== Post.STATUS.FAILED) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Photo has already been processed')
                    )
                }

                return post_model
                    .save({
                        status: Post.STATUS.PROCESSING
                    }, {
                        patch: true,
                        transacting: trx
                    })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.updateUploadFailedAlert(post_model.get('parent_id'), post_model.get('id'));
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    photoFailedCallback(post_id, trx) {
        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                withRelated: ['assignment', 'owner', 'parent'],
                transacting: trx
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PROCESSING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Photo is not being processed')
                    )
                }

                return post_model.save({
                    status: Post.STATUS.FAILED
                }, {
                    patch: true,
                    transacting: trx
                })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.notifyPostFailed(post_model);
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    videoCompleteCallback(post_id, { video, image, stream, width, height, duration }, trx) {
        if (video) video = config.AWS.CLOUDFRONT.VIDEO_URL + video
        if (stream) stream = config.AWS.CLOUDFRONT.STREAM_URL + stream
        if (image) image = config.AWS.CLOUDFRONT.THUMB_URL + image

        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                transacting: trx,
                withRelated: ['assignment', 'parent', 'owner']
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PROCESSING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video is not being processed')
                    )
                }

                return post_model
                    .save({
                        status: Post.STATUS.COMPLETE,
                        width,
                        height,
                        duration,
                        image,
                        video,
                        stream
                    }, {
                        patch: true,
                        transacting: trx
                    })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.notifyPostComplete(post_model, trx);
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    videoProcessingCallback(post_id, trx) {
        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PENDING && post_model.get('status') !== Post.STATUS.FAILED) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video has already been processed')
                    )
                }

                return post_model
                    .save({
                        status: Post.STATUS.PROCESSING
                    }, {
                        patch: true,
                        transacting: trx
                    })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.updateUploadFailedAlert(post_model.get('parent_id'), post_model.get('id'));
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    videoFailedCallback(post_id, trx) {
        let post_model = Post.forge({ id: post_id });
        return post_model
            .fetch({
                require: true,
                withRelated: ['assignment', 'owner', 'parent'],
                transacting: trx
            })
            .catch(Post.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Post not found'))
            )
            .then(post_model => {
                if (post_model.get('status') !== Post.STATUS.PROCESSING && post_model.get('status') !== Post.STATUS.PENDING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video is not being processed')
                    )
                }

                return post_model.save({
                    status: Post.STATUS.FAILED
                }, {
                    patch: true,
                    transacting: trx
                })
            })
            .then(() => {
                if (post_model.has('owner_id')) {
                    NotificationController.Types.Submission.notifyPostFailed(post_model);
                }

                return Promise.resolve({ result: 'ok' });
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    report(user_model, { since = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30)) } = {}) {
        return new Promise((resolve, reject) => {
            let knex = Post.knex;

            knex
                .raw(`
                    SELECT
                        posts.id AS id,
                        posts.created_at AS created_at,
                        posts.owner_id,
                        owner.username AS owner_username,
                        (CASE WHEN video IS NOT NULL THEN 'video' ELSE 'photo' END) AS type,
                        (CASE WHEN posts.rating = 2 THEN TRUE ELSE FALSE END) AS verified,
                        assignment.id AS assignment_id,
                        assignment.title AS assignment_title,
                        (CASE WHEN COUNT(outlets) > 0 THEN ARRAY_TO_STRING(ARRAY_AGG(outlets.title), ',') ELSE NULL END) AS purchased_by
                    FROM posts
                    INNER JOIN users AS owner ON owner.id = owner_id
                    LEFT JOIN assignments AS assignment ON assignment.id = posts.assignment_id
                    LEFT JOIN purchases ON posts.id = purchases.post_id
                    LEFT JOIN outlets ON outlets.id = purchases.outlet_id
                    WHERE posts.created_at >= ?
                    GROUP BY posts.id, owner.username, assignment.id
                    ORDER BY posts.created_at DESC;
                `, [since])
                .then(result => resolve(result.rows))
                .catch(ferror.trip(reject));
        });
    }
}

module.exports = new SubmissionsController;

const AWSController = require('./AWS');
const NotificationController = require('./Notification');