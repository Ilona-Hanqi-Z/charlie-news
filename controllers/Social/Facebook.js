'use strict';

const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const SocialLink = require('../../models/social_link');
const superagent = require('superagent');
const User = require('../../models/user');

/**
 * Facebook Social Controller
 * Handles linking social media accounts
 */
class Facebook {
    /**
     * Link the given user with the facebook account associated with the
     * supplied facebook token.
     * 
     * @param {String}      user_id   The Fresco account this link is associated with
     * @param {String}      token
     * @param {Transaction} trx       Knex transaction
     * 
     * @returns {Promise}
     */
    linkAccount({ token } = {}, { user, trx } = {}) {
        return this
            .resolveToken(token)
            .then(fb_id => {
                if (!fb_id) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('Invalid Facebook credentials')
                    );
                }

                return new SocialLink({
                        user_id: user.get('id'),
                        account_id: fb_id,
                        platform: SocialLink.SOURCES.FACEBOOK
                    })
                    .save(null, { method: 'insert', transacting: trx })
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => {
                err.network = 'Facebook';
                return Promise.reject(ferror.constraint(err));
            });
    }
    
    /**
     * Resolves the given Facebook access token to the associated Fresco account
     *
     * @param {String}  token   Facebook access token
     * 
     * @returns {Promise}
     */
    resolveAccount(token, { trx } = {}) {
        return this
            .resolveToken(token)
            .then(fb_id => {
                if (!fb_id) return Promise.reject(ferror(ferror.NOT_FOUND));

                return SocialLink
                    .where({
                        account_id: fb_id,
                        platform: SocialLink.SOURCES.FACEBOOK
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
     * Gets the media from the given tweet
     * 
     * @param {Model}  user_model
     * @param {Model}  gallery_model
     * @param {String} tweet_id
     * @param {Transaxtion} _trx
     */
    importPosts(user_model, gallery_model, tweet_id, { trx } = {}) {
        throw Error('Not Implemented')
    }
    
    /**
     * Unlinks the user's Facebook account from their Fresco account
     *
     * @param   {Integer}     user_id   The user to unlink from Facebook
     * @param   {Transaction} trx       Knex transaction
     * 
     * @returns {Promise}
     */
    unlinkAccount({ user, trx } = {}) {
        return SocialLink
            .where({
                user_id: user.get('id'),
                platform: SocialLink.SOURCES.FACEBOOK
            })
            .destroy({
                transacting: trx
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Resolves the given Facebook access token to the Facebook user id
     *
     * @param   {String}    token   Facebook access token
     *
     * @returns {Promise}
     */
    resolveToken(token) {
        return new Promise((resolve, reject) => {
            superagent
                .get('https://graph.facebook.com/me?fields=id,name,email&access_token=' + token)
                .set('Accept', 'application/json')
                .end((err, res) => {
                    if (err && !res) {
                        reject(err);
                    } else if (res.statusType === 4) {
                        resolve(); // Invalid FB token
                    } else if (res.statusType === 2) {
                        resolve(res.body.id);
                    } else {
                        reject(); // Unknown error
                    }
                });
        });
    }
}

module.exports = new Facebook;
