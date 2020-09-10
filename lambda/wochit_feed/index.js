'use strict';

const AWS = require('aws-sdk');
const base64 = require('base64-js');
const Promise = require('bluebird');
const superagent = require('superagent');

const S3 = new AWS.S3();
const S3Params = {
    Bucket: 'com.fresconews.v2.prod',
    Key: 'integrations/wochit/config.json'
};

let config = {};

Promise.promisifyAll(S3);
Promise.promisifyAll(superagent);

// convert client id and secret to base64 Basic Authorization header
function makeAuthHeader({ id, secret } = {}) {
    let buff = new Buffer(id + ':' + secret);
    return 'Basic ' + buff.toString('base64');
}

// called on failure
function fail(err) {
    console.error(err);
    throw err;
}

// logs basic information regarding this export
function reportStats(content = []) {
    console.log(`Finished exporting ${content.length} pieces of content to Wochit!`);
    console.log('Posts exported: ', content.map(c => c.id).join(' '));
}

// load the config from s3
function loadConfig() {
    return S3
        .getObjectAsync(S3Params)
        .then(result => {
            // update the config object
            config = JSON.parse(result.Body);
        });
}

// save config changes to s3
function saveConfig() {
    return S3.uploadAsync(Object.assign({ Body: JSON.stringify(config) }, S3Params));
}

// make sure that both tokens are still valid. if not, generate new ones
function checkTokens() {
    let promises = [];

    if (config.fresco.accessToken == null) {
        promises.push(generateFrescoToken());
    } else if (Date.now() > new Date(config.fresco.accessToken.expiresAt).getTime()) {
        promises.push(refreshFrescoToken());
    }

    if (config.wochit.accessToken == null || Date.now() > new Date(config.wochit.accessToken.expiresAt).getTime()) {
        promises.push(generateWochitToken());
    }

    return Promise.all(promises);
}

// generate a new Fresco access token
function generateFrescoToken() {
    return superagent
        .post(config.fresco.apiRoot + '/auth/token')
        .set('Authorization', makeAuthHeader(config.fresco.client))
        .set('Accept', 'application/json')
        .send({ grant_type: 'client_credentials' })
        .endAsync()
        .then(res => {
            config.fresco.accessToken = {
                token: res.body.access_token.token,
                refreshToken: res.body.access_token.refresh_token,
                expiresAt: new Date(res.body.access_token.expires_in + Date.now()).toISOString()
            };
        });
}

// refresh an existing Fresco access token
function refreshFrescoToken() {
    if (config.fresco.accessToken == null || !config.fresco.refreshToken) {
        return generateFrescoToken();
    }

    return superagent
        .post(config.fresco.apiRoot + '/auth/token')
        .set('Authorization', makeAuthHeader(config.fresco.client))
        .set('Accept', 'application/json')
        .send({
            grant_type: 'refresh_token',
            refresh_token: config.fresco.accessToken.refreshToken
        })
        .endAsync()
        .then(res => {
            config.fresco.accessToken = {
                token: res.body.access_token.token,
                refreshToken: res.body.access_token.refresh_token,
                expiresAt: new Date(res.body.access_token.expires_in + Date.now()).toISOString()
            };
        })
        .catch(err => {
            if (err.status == 401 && err.response.param === 'refresh_token') {
                return generateFrescoToken();
            } else {
                throw err;
            }
        });
}

// generate a new wochit access token
function generateWochitToken() {
    return superagent
        .post(config.wochit.apiRoot + '/oauth/access_token')
        .set('Authorization', makeAuthHeader(config.wochit.client))
        .set('x-api-key', config.wochit.apiKey)
        .set('Accept', 'application/json')
        .endAsync()
        .then(res => {
            config.wochit.accessToken = {
                token: res.body.token,
                expiresAt: res.body.expirationTime
            };
        });
}

// sets the last post to the most recent one in the Fresco feed.
// used if lastPostId is not set, or is set to an invalid post
function resetLastPost(__isRetry = false) {
    return superagent
        .get(config.fresco.apiRoot + '/post/list')
        .query({
            rating: 2,
            sortBy: 'created_at',
            direction: 'desc',
            limit: 1
        })
        .set('Authorization', 'Bearer ' + config.fresco.accessToken.token)
        .set('Accept', 'application/json')
        .endAsync()
        .then(res => {
            let posts = res.body;
            if (posts.length === 0) {
                // if feed it empty, throw an error. This should never happen.
                throw new Error('Fresco feed is empty!');
            }

            config.lastPostId = posts[0].id;
        })
        .catch(err => {
            if (err.status == 401 && !__isRetry) {
                return refreshFrescoToken().then(() => resetLastPost(true));
            } else {
                throw err;
            }
        });
}

// ensures that the last post is valid
// if not, fetch a new "last" post
function checkLastPost(__isRetry = false) {
    if (typeof config.lastPostId !== 'string') {
        return resetLastPost();
    }

    return superagent
        .get(config.fresco.apiRoot + '/post/' + config.lastPostId)
        .set('Authorization', 'Bearer ' + config.fresco.accessToken.token)
        .set('Accept', 'application/json')
        .endAsync()
        .then(res => {
            // post is valid, proceed
        })
        .catch(err => {
            if (err.status == 401 && !__isRetry) {
                return refreshFrescoToken().then(() => checkLastPost(true));
            } else if (err.status == 400 || err.status == 404) { // post was invalid, fetch new one
                return resetLastPost();
            } else {
                throw err;
            }
        });
}

// fetch the content from Fresco
// __isRetry is used for retrying once on Auth failure
function fetchContent(__isRetry = false) {
    // if lastPostId is not set, skip
    // this should never happen
    if (!config.lastPostId) {
        return Promise.resolve([]);
    }

    return superagent
        .get(config.fresco.apiRoot + '/post/list')
        .query({
            rating: 2,
            sortBy: 'created_at',
            direction: 'asc',
            limit: config.maxContentCount,
            last: config.lastPostId,
        })
        .set('Authorization', 'Bearer ' + config.fresco.accessToken.token)
        .set('Accept', 'application/json')
        .endAsync()
        .then(res => {
            let posts = res.body;

            if (posts.length === 0) return posts;

            config.lastPostId = posts[posts.length - 1].id;

            return posts.map(post => {
                let result = {
                    id: post.id,
                    keywords: [],
                    contentType: 'Editorial',
                    publicationDate: (post.captured_at || post.created_at),
                    takenByArtist: ''
                };

                if (post.stream != null) {
                    result.type = 'VIDEO';
                    result.posterUrl = post.image;
                    result.downloadUrl = post.video;
                } else {
                    result.type = 'IMAGE';
                    result.posterUrl = null;
                    result.downloadUrl = post.image;
                }

                if (post.parent) {
                    result.caption = post.parent.caption;
                    result.title = post.parent.caption.substr(0, config.captionMaxLength);
                    result.keywords = post.parent.tags;

                    // if caption is too long for title, truncate at last possible space and add ellipse
                    if (post.parent.caption.length > config.captionMaxLength) {
                        const n = result.title.lastIndexOf(" ");
                        result.title = result.title.substring(0, n) + '...';
                    }
                }

                if (post.owner) {
                    result.takenByArtist = post.owner.full_name || post.owner.username || result.takenByArtist;
                } else if (post.curator) {
                    result.takenByArtist = post.curator.full_name || post.curator.username || result.takenByArtist;
                }

                return result;
            });
        })
        .catch(err => {
            if (err.status == 401 && !__isRetry) {
                return refreshFrescoToken().then(() => fetchContent(true));
            } else {
                throw err;
            }
        });
}

// push the content to Wochit's feed
// __isRetry is used for retrying once on Auth failure
function pushContent(content = [], __isRetry = false) {
    if (content.length === 0) return Promise.resolve();

    return superagent
        .post(config.wochit.apiRoot + '/assets')
        .set('Authorization', 'Bearer ' + config.wochit.accessToken.token)
        .set('x-api-key', config.wochit.apiKey)
        .set('Accept', 'application/json')
        .send({
            mediaProviderAssetModels: content
        })
        .endAsync()
        .then(() => content) // return content, ignore api response
        .catch(err => {
            if (err.status == 401 && !__isRetry) {
                return generateWochitToken().then(() => pushContent(content, true));
            } else {
                throw err;
            }
        });
}

// main handler
exports.handler = function() {
    loadConfig() // load the config from s3
        .then(checkTokens) // set up access tokens for fresco and wochit platforms
        .then(checkLastPost) // check that the post recorded as the last one requested is still valid. if not, fetch a new "last"
        .then(fetchContent) // fetch the content from Fresco
        .then(pushContent) // export the content to Wochit
        .then(reportStats) // log the stats for this event
        .then(saveConfig) // overwrite the config in s3, saving the valid access tokens and new last post
        .catch(fail); // error reporting
};