'use strict';

const config = require('../config');

const _ = require('lodash');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const ferror = require('../lib/frescoerror')
const hashids = require('../lib/hashids')
const mime = require('mime');

const Post = require('../models/post')

const S3 = new AWS.S3();

class AWSController {

    /**
     * Use to generate a unique AWS S3 object key
     * 
     * @param postfix {string} optional, key to place after the random key
     * @param extension {string} optional, extension to append to key
     * 
     * @returns {string}
     */
    genKey({ postfix, extension, mimetype } = {}) {
        if (mimetype) extension = mime.extension(mimetype);
        return crypto.randomBytes(16).toString('hex')
            + '_' + Date.now()
            + (postfix ? ('_' + postfix) : '')
            + (extension ? ('.' + extension) : '');
    }

    /**
     * Generates the key for the thumbnail of the given
     * video key, at the given index
     * 
     * @param key {string}
     * @param index {int}
     * 
     * @returns {string}
     */
    genThumbnailKey(key, index = 1) {
        index = String(index);
        while (index.length < 5) {
            index = '0' + index;
        }
        return `${key}-thumb-${index}${config.AWS.CLOUDFRONT.IMAGE_EXTENSION}`;
    }

    /**
     * Generates signed URLs for upload
     *
     * @param key
     * @param upload_id
     * @param fileSize
     * @param chunkSize
     * @returns {Array}
     */
    genSignedUrls({key, upload_id, contentType, fileSize = 0, chunkSize = 10485760}) {
        let lastSize = 0, chunks = 1, _fileSize = fileSize, urls = [];

        while(_fileSize > chunkSize) {
            _fileSize -= chunkSize;
            chunks++;
        }

        lastSize = _fileSize;

        for(let x = 1; x <= chunks; x++) {
            // let size = x === chunks ? lastSize : chunkSize;
            let url = S3.getSignedUrl('uploadPart', {
                Bucket: config.AWS.S3.BUCKET,
                Key: key,
                PartNumber: x,
                Expires: 86400,
                UploadId: upload_id
            });

            urls.push(url);
        }

        return urls;
    }

    /**
     * Generates AWS S3 signed upload url(s) for the given post
     * 
     * @param type {string} Possible types: "avatar", "recap", "submission", "import"
     * @param options {object}
     * @param options.contentType {string}
     * @param options.multipart {boolean}
     * @param options.fileSize {int}
     * @param options.chunkSize {int} If left out, upload will be single part
     * @param options.recap_id {int}
     * @param options.post_id {int}
     * @param options.assignment_id {int}
     * 
     * @returns {Promise}
     */
    generateUploadURLs(type = 'submission', { key, contentType = 'image/jpg', fileSize, chunkSize, recap_id, post_id }) {
        if (!key) key = this.genKey({ postfix: type });
        let ext = '.' + mime.extension(contentType);
        let meta = {};

        if (type === 'recap') {
            meta.recap_id = recap_id.toString();
        } else {
            meta.post_id = post_id.toString();
        }

        return new Promise((resolve, reject) => {
            if (chunkSize) {
                S3.createMultipartUpload({
                    Bucket: config.AWS.S3.BUCKET,
                    Key: config.AWS.S3.UPLOAD_DIRECTORY + key + ext,
                    ContentType: contentType,
                    Metadata: meta
                }, (err, { UploadId } = {}) => {
                    if (err) return reject(err);

                    resolve({
                        recap_id,
                        post_id,
                        key: key + ext,
                        uploadId: UploadId,
                        upload_urls: this.genSignedUrls({
                            key: config.AWS.S3.UPLOAD_DIRECTORY + key + ext,
                            upload_id: UploadId,
                            fileSize,
                            chunkSize,
                            contentType
                        })
                    });
                });
            } else {
                resolve({
                    recap_id,
                    post_id,
                    key: key + ext,
                    upload_url: S3.getSignedUrl('putObject', {
                        Bucket: config.AWS.S3.BUCKET,
                        Key: config.AWS.S3.UPLOAD_DIRECTORY + key + ext,
                        Expires: 86400,
                        ContentType: contentType,
                        Metadata: meta
                    })
                });
            }
        });
    }

    /**
     * Generates a URL for fetching a piece of content from S3
     * 
     * @param {string} url uri point to object in S3
     * @param {number} expire expires url after time given in seconds
     * 
     * @returns {string}
     */
    generateDownloadURL(uri, expire) {
        return S3.getSignedUrl('getObject', {
            Bucket: config.AWS.S3.BUCKET,
            Key: uri,
            Expires: expire,
            ResponseContentDisposition: 'attachment'
        })
    }

    /**
     * Handle the Elastic Transcoder notification
     */
    videoCallback(sns_data = {}, trx) {
        if (!_.isObject(sns_data)) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Invalid request payload')
            );
        }

        let et_data
        try {
            et_data = (typeof sns_data.Message === 'string') ? JSON.parse(sns_data.Message) : sns_data.Message;
        } catch (err) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Invalid request payload')
            )
        }
        if (!_.isObject(et_data)) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Invalid request payload')
            );
        }

        let metadata = et_data.userMetadata
        let mp4_output = et_data.outputs.find(o => o.presetId === config.AWS.TRANSCODER.PRESETS.MP4)

        if (!metadata) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing UserMetadata')
            )
        }
        if (!mp4_output) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing mp4 output info')
            )
        }

        let controller, object_id

        if (metadata.post_id) {
            controller = SubmissionController
            object_id = metadata.post_id
        } else if (metadata.recap_id) {
            controller = RecapController
            object_id = metadata.recap_id
        }

        // Decode the hash, if the file was uploaded from the S3 client
        if (object_id.match(/[a-z]/i)) {
            object_id = hashids.decode(object_id);
        }

        switch (et_data.state) {
            case 'COMPLETED':
                return controller.videoCompleteCallback(object_id, {
                    job_id: et_data.jobId,
                    width: mp4_output.width,
                    height: mp4_output.height,
                    duration: mp4_output.duration
                }, trx)
            case 'PROGRESSING':
                return controller.videoProcessingCallback(object_id, trx)
            case 'ERROR':
                return controller.videoFailedCallback(object_id, trx)
            default:
                return Promise.reject(
                    ferror(ferror.FAILED_REQUEST)
                        .msg('Invalid status returned')
                        .param('Message[outputs][0][status]')
                        .value(mp4_output.status)
                )
        }
    }
    videoFailedCallback({ post_id, recap_id } = {}, trx) {
        let controller = post_id ? SubmissionController : RecapController
        let object_id = post_id || recap_id
        return controller.videoFailedCallback(object_id, trx)
    }
}

module.exports = new AWSController;

const SubmissionController = require('./Submission')
const RecapController = require('./Recap')