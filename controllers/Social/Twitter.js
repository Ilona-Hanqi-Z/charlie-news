'use strict';

const AWS = require('aws-sdk');
const Promise = require('bluebird');
const crypto = require('crypto');
const https = require('https');
const superagent = require('superagent');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');
const twitter = require('../../lib/twitter');

const SocialLink = require('../../models/social_link');
const Post = require('../../models/post');
const User = require('../../models/user');

const s3 = new AWS.S3();

/**
 * Twitter Social Controller
 * Handles linking social media accounts
 */
class Twitter {
    /**
     * Link the given user with the twitter account associated with the
     * supplied twitter token info.
     * 
     * @param {String} user_id     The Fresco account this link is associated with
     * @param {String}      token
     * @param {String}      secret
     * @param {Transaction} trx       Knex transaction
     * 
     * @returns {Promise}
     */
    linkAccount({ token, secret } = {}, { user, trx } = {}) {
        return this
            .resolveToken(token, secret)
            .then(twitter_id => {
                if (!twitter_id) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('Invalid Twitter credentials')
                    );
                }

                return new SocialLink({
                        user_id: user.get('id'),
                        account_id: twitter_id,
                        platform: SocialLink.SOURCES.TWITTER
                    })
                    .save(null, { method: 'insert', transacting: trx })
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => {
                err.network = 'Twitter';
                return Promise.reject(ferror.constraint(err));
            });
    }

    /**
     * Resolves the given Twitter OAuth1 creds to the associated Fresco account
     * 
     * @param           OAuth1 components
     * 
     * @returns {Promise}
     */
    resolveAccount(access_token, access_secret, { trx } = {}) {
        return this
            .resolveToken(access_token, access_secret)
            .then(twitter_id => {
                if (!twitter_id) return Promise.reject(ferror(ferror.NOT_FOUND));

                return SocialLink
                    .where({
                        account_id: twitter_id,
                        platform: SocialLink.SOURCES.TWITTER
                    })
                    .fetch({
                        transacting: trx,
                        withRelated: {
                            user: qb => {
                                qb.select(User.FILTERS.SAFE);
                            }
                        }
                    });
            })
            .then(link => link ? link.related('user') : null)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Unlinks the user's Facebook account from their Fresco account
     *
     * @param {Integer} user_id     The ID of the account to disassociate with Twitter
     * @param {Transaction} trx     Knex transaction
     * 
     * @returns {Promise}
     */
    unlinkAccount({ user, trx } = {}) {
        return SocialLink
            .where({
                user_id: user.get('id'),
                platform: SocialLink.SOURCES.TWITTER
            })
            .destroy({
                transacting: trx
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
    
    /**
     * Gets the media from the given tweet
     * 
     * @param {Model}  user_model
     * @param {Model}  gallery_model
     * @param {String} tweet_id
     * @param {Transaxtion} _trx
     */
    importPosts(user_model, gallery_model, tweet_id, _trx) {
        return new Promise((resolve, reject) => {
            twitter.get(`https://api.twitter.com/1.1/statuses/show/${tweet_id}.json`, {}, (err, tweet) => {
                if (err) {
                    // Handle both internal and user-caused errors
                    if (err[0].code === 144 || err[0].code === 34) {
                        return error(
                            ferror(ferror.INVALID_REQUEST)
                                .param('external_id')
                                .value(tweet_id)
                                .msg('Invalid tweet ID')
                        );
                    } else {
                        return error(ferror(err).type(ferror.API));
                    }
                }

                // Update the gallery's caption, if it has not yet been set
                if (!gallery_model.has('caption')) {
                    gallery_model.set('caption', tweet.text.replace(/\n$/, ' ')); // TODO this does not replace newlines as it should
                }
                
                // Save hashtags within tweet as tags
                if (!gallery_model.has('tags')) {
                    gallery_model.set('tags', tweet.entities.hashtags.map(tag => tag.text));
                }

                gallery_model.set('external_id', tweet_id);
                if (tweet.user) {
                    gallery_model.set('external_url', `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`);
                    gallery_model.set('external_account_id', tweet.user.id_str);
                    gallery_model.set('external_account_username', tweet.user.screen_name);
                    gallery_model.set('external_account_name', tweet.user.name);
                }
                gallery_model.set('external_source', 'twitter');

                // Import each post
                Promise
                    .map((tweet.extended_entities || tweet.entities).media || [], makePost)
                    .then(resolve)
                    .catch(error);

                function makePost({ media_url_https, video_info } = {}) {
                    let content_type;
                    let isVideo = false;

                    // If this media has video info, get highest bitrate source info
                    if (video_info) {
                        let source = null;
                        video_info.variants.forEach(v => {
                            if (!v.bitrate) return;
                            if (!source || source.bitrate < v.bitrate) source = v;
                        });

                        if (source) {
                            content_type = source.content_type
                            media_url_https = source.url;
                        }
                    }

                    // If content type wasn't found, set based on file extension
                    if (!content_type) {
                        let ext = media_url_https.split('.').pop();
                        switch (ext) {
                            case 'jpg':
                            case 'jpeg':
                                content_type = 'image/jpeg';
                                break;
                            case 'png':
                                content_type = 'image/png';
                                break;
                            default:
                                isVideo = true;
                                content_type = 'application/octet_stream';
                                break;
                        }
                    }
                    
                    return new Promise((_resolve, _reject) => {
                        let key = AWSController.genKey({ postfix: 'import' });

                        let post = new Post({
                            parent_id: gallery_model.get('id'),
                            curator_id: user_model.get('id'),
                            image: isVideo
                                        ? config.AWS.CLOUDFRONT.THUMB_URL + AWSController.genThumbnailKey(key)
                                        : config.AWS.CLOUDFRONT.PHOTO_URL + key + config.AWS.CLOUDFRONT.IMAGE_EXTENSION,
                            video: isVideo
                                        ? config.AWS.CLOUDFRONT.VIDEO_URL + key + config.AWS.CLOUDFRONT.VIDEO_EXTENSION
                                        : null,
                            stream: isVideo
                                        ? config.AWS.CLOUDFRONT.STREAM_URL + key + config.AWS.CLOUDFRONT.STREAM_EXTENSION
                                        : null,
                        });

                        post
                            .save(null, { method: 'insert', transacting: _trx })
                            .then(makeUpload)
                            .catch(ferror.constraint(_reject));

                        function makeUpload() {
                            s3.createMultipartUpload({
                                ACL: 'public-read',
                                Bucket: config.AWS.S3.BUCKET,
                                Key: config.AWS.S3.UPLOAD_DIRECTORY + key + '.' + media_url_https.split('.').pop(),
                                ContentDisposition: 'inline',
                                ContentType: content_type,
                                Metadata: {
                                    assignment: '', // TODO assignment support?
                                    post: post.get('id').toString()
                                }
                            }, (err, data) => {
                                if (err) {
                                    return _reject(ferror(err).type(ferror.API));
                                }
                                startUpload(data);
                            });
                        }

                        function startUpload(upload = {}) {
                            https.get(media_url_https, res => {
                                let part = 0;
                                let parts = [];
                                let thisPart = new Buffer(0);
                                
                                res.on('error', err => abortUpload(upload, err));
                                res.on('end', () => {
                                    if (thisPart.length) {
                                        parts.push(uploadPart(upload, ++part, thisPart));
                                    }
                                    Promise
                                        .all(parts)
                                        .then(_parts => completeUpload(upload, _parts))
                                        .catch(err => abortUpload(upload, err));
                                });
                                
                                res.on('data', data => {
                                    thisPart = Buffer.concat([thisPart, data]);
                                    
                                    if (thisPart.length >= 5242880) { // 5MB minimum part upload
                                        parts.push(uploadPart(upload, ++part, thisPart));
                                        thisPart = new Buffer(0);
                                    }
                                });
                            });
                        }
                        
                        function uploadPart(upload, part, buffer) {
                            return new Promise((__resolve, __reject) => {
                                s3.uploadPart({
                                    Bucket:     upload.Bucket,
                                    Key:        upload.Key,
                                    UploadId:   upload.UploadId,
                                    PartNumber: part,
                                    Body:       buffer
                                }, (err, data) => {
                                    if (err) {
                                        return __reject(err);
                                    }
                                    __resolve({
                                        ETag: data.ETag,
                                        PartNumber: part
                                    });
                                });
                            })
                        }

                        function completeUpload(upload = {}, parts) {
                            s3.completeMultipartUpload({
                                Bucket:     upload.Bucket,
                                Key:        upload.Key,
                                UploadId:   upload.UploadId,
                                MultipartUpload: {
                                    Parts: parts
                                }
                            }, (err, data) => {
                                if (err) return abortUpload(upload, err);
                                post.save({ status: Post.STATUS.COMPLETE }, { method: 'update', transacting: _trx })
                                    .then(_resolve)
                                    .catch(ferror.constraint(_reject));
                            });
                        }

                        function abortUpload(upload, err) {
                            s3.abortMultipartUpload({
                                Bucket:     upload.Bucket,
                                Key:        upload.Key,
                                UploadId:   upload.UploadId
                            }, _err => {
                                if (_err) {
                                    console.error('Error aborting failed s3 multipart upload');
                                    console.error('Tweet ID:', tweet_id);
                                    console.error(_err);
                                }
                                _reject(ferror(err).type(ferror.API))
                            });
                        }
                    });
                }
            });
            
            function error(err) {
                if (err.constraint === 'media_exists') {
                    reject(
                        ferror(ferror.INVALID_REQUEST)
                            .param('external_id')
                            .value(tweet_id)
                            .msg('This tweet has already been imported')
                    );
                } else if (err._fresco) {
                    reject(err);
                } else {
                    reject(ferror(err).type(ferror.API));
                }
            }
        });
    }

    /**
     * Resolves the given Twitter OAuth1 creds to the Twitter user id
     *
     * @returns {Promise}
     */
    resolveToken(access_token, access_secret) {
        return new Promise((resolve, reject) => {
            superagent
                .get('https://api.twitter.com/1.1/account/verify_credentials.json')
                .set('Accept', 'application/json')
                .set('Authorization', makeOAuth1(access_token, access_secret))
                .end((err, res) => {
                    if (err) {
                        if(err.message == 'Too Many Requests') {
                            reject(ferror(ferror.UNAUTHORIZED).msg('Too many login attempts'))
                        }
                        reject(err); // Request error
                    } else if (res.statusType === 4) {
                        resolve(); // Invalid OAuth1
                    } else if (res.statusType === 2) {
                        resolve(res.body.id_str);
                    } else {
                        reject(); // Unknown error
                    }
                });
        });
    }
}

/**
 * Generates the Authentication header for OAuth1
 * 
 * @param OAuth1 components
 * 
 * @returns {String}
 */
function makeOAuth1(access_token, access_secret) {
    let nonce = crypto.randomBytes(16).toString('hex');
    let ts = Math.floor(Date.now() / 1000);
    let baseString = 'GET&https%3A%2F%2Fapi.twitter.com%2F1.1%2Faccount%2Fverify_credentials.json&' +
        'oauth_consumer_key%3D' + config.TWITTER.CONSUMER_KEY + '%26' +
        'oauth_nonce%3D' + nonce + '%26' +
        'oauth_signature_method%3DHMAC-SHA1%26' +
        'oauth_timestamp%3D' + ts +'%26' +
        'oauth_token%3D' + access_token + '%26' +
        'oauth_version%3D1.0';

    let signature = encodeURIComponent(crypto.createHmac('sha1', config.TWITTER.CONSUMER_SECRET + '&' + access_secret).update(baseString).digest('base64'));

    let oauth_header = 'OAuth oauth_consumer_key="' + config.TWITTER.CONSUMER_KEY +
        '", oauth_nonce="' + nonce +
        '", oauth_signature="' + signature +
        '", oauth_signature_method="HMAC-SHA1", oauth_timestamp="' + ts +
        '", oauth_token="' + access_token+ '", oauth_version="1.0"';

    return oauth_header;
}

module.exports = new Twitter;

const AWSController = require('../AWS');