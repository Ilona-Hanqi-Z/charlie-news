'use strict';

const config = require('../config');

const ferror = require('../lib/frescoerror');

const Recap = require('../models/recap');

class RecapController {

    create(user_model, params, trx) {
        let key = AWSController.genKey({ postfix: 'recap',  })
        params.image = config.AWS.CLOUDFRONT.THUMB_URL + AWSController.genThumbnailKey(key);
        params.video = config.AWS.CLOUDFRONT.VIDEO_URL + key + config.AWS.CLOUDFRONT.VIDEO_EXTENSION;
        params.stream = config.AWS.CLOUDFRONT.STREAM_URL + key + config.AWS.CLOUDFRONT.STREAM_EXTENSION;

        return new Recap(params)
            .save(null, { transacting: trx })
            .then(recap_model => 
                AWSController
                    .generateUploadURLs('recap', { recap_id: recap_model.get('id'), multipart: false, contentType: 'video/mp4' })
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    list(user_model, { sortBy = 'updated_at', direciton = 'desc', limit = 20, last, page } = {}, trx) {
        return new Promise((resolve, reject) => {
            Recap
                .query(qb => {
                    qb.select(Recap.FILTERS.PUBLIC);
                    Recap.QUERIES.VISIBLE(qb);
                    Recap.paginate(qb, { sortBy, direction, limit, page, last });
                })
                .fetchAll({ transacting: trx })
                .then(resolve)
                .catch(ferror.constraint(reject));
        });
    }

    get(user_model, ids, trx) {
        let isArr = true;
        if (!_.isArray(ids)) {
            isArr = false;
            ids = [ids];
        }

        return Recap
            .whereIn('id', ids)
            .fetchAll({
                columns: Recap.FILTERS.PUBLIC,
                require: true,
                transacting: trx
            })
            .then(rs => Promise.resolve(isArr ? rs : rs.models[0]))
            .catch(Recap.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Recap not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    update(user_model, recap_id, updates, trx) {
        updates.updated_at = new Date();
        return Recap
            .where('id', recap_id)
            .save(updates, {
                require: true,
                patch: true,
                transacting: trx
            })
            .catch(Recap.NoRowsUpdatedError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Recap not found')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    delete(user_model, recap_id, trx) {
        return Recap
            .where('id', recap_id)
            .destroy({
                require: true,
                transacting: trx
            })
            .catch(Recap.NoRowsDeletedError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Recap not found')
                )
            )
            .then(() => Promise.resolve({ success: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    videoCompleteCallback(recap_id, { video, image, stream, width, height, duration } = {}, trx) {
        if (video) video = config.AWS.CLOUDFRONT.VIDEO_URL + video
        if (stream) stream = config.AWS.CLOUDFRONT.STREAM_URL + stream
        if (image) image = config.AWS.CLOUDFRONT.THUMB_URL + image

        return Recap
            .forge({ id: recap_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Recap.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Recap not found'))
            )
            .then(recap_model => {
                if (recap_model.get('status') !== Recap.STATUS.PROCESSING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video is not being processed')
                    )
                }

                return recap_model.save({
                    status: Recap.STATUS.COMPLETE,
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
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    videoProcessingCallback(recap_id, trx) {
        return Recap
            .forge({ id: recap_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Recap.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Recap not found'))
            )
            .then(recap_model => {
                if (recap_model.get('status') !== Recap.STATUS.PENDING && recap_model.get('status') !== Recap.STATUS.FAILED) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video has already been processed')
                    )
                }

                return recap_model.save({
                    status: Recap.STATUS.PROCESSING
                }, {
                    patch: true,
                    transacting: trx
                })
            })
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
    videoFailedCallback(recap_id, trx) {
        return Recap
            .forge({ id: recap_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(Recap.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Recap not found'))
            )
            .then(recap_model => {
                if (recap_model.get('status') !== Recap.STATUS.PROCESSING && recap_model.get('status') !== Recap.STATUS.PENDING) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Video is not being processed')
                    )
                }

                return recap_model.save({
                    status: Recap.STATUS.FAILED
                }, {
                    patch: true,
                    transacting: trx
                })
            })
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)))
    }
}

module.exports = new RecapController;

const AWSController = require('./AWS');