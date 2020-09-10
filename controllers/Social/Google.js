'use strict';

const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const jsonwebtokens = require('jsonwebtoken');
const jwk2pem = require('pem-jwk').jwk2pem;
const SocialLink = require('../../models/social_link');
const superagent = require('superagent');
const User = require('../../models/user');

/**
 * Google Social Controller
 * Handles linking social media accounts
 */
class Google {
    /**
     * Link the given user with the google account associated with the
     * supplied google token.
     * 
     * @param {object} options
     * @param {string} options.jwt
     * @param {object} [context]
     * @param {string} [context.user] The user this link is associated with
     * @param {knex.Transaction} [context.trx] Knex transaction
     * 
     * @returns {Promise<UserModel>}
     */
    linkAccount({ jwt } = {}, { user, trx } = {}) {
        return this
            .resolveToken(jwt)
            .then(g_id => {
                if (!g_id) {
                    return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('Invalid Google credentials')
                    );
                }

                return new SocialLink({
                        user_id: user.get('id'),
                        account_id: g_id,
                        platform: SocialLink.SOURCES.GOOGLE
                    })
                    .save(null, { method: 'insert', transacting: trx })
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => {
                err.network = 'Google';
                return Promise.reject(ferror.constraint(err));
            });
    }
    
    /**
     * Resolves the given Google access token to the associated Fresco account
     *
     * @param {String}  jwt   Google authorization code
     * 
     * @returns {Promise}
     */
    resolveAccount(jwt, { trx } = {}) {
        return this
            .resolveToken(jwt)
            .then(g_id => {
                if (!g_id) return Promise.reject(ferror(ferror.NOT_FOUND));

                return SocialLink
                    .where({
                        account_id: g_id,
                        platform: SocialLink.SOURCES.GOOGLE
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
     * Unlinks the user's Google account from their Fresco account
     *
     * @param   {Integer}     user_id   The user to unlink from Google
     * @param   {Transaction} trx       Knex transaction
     * 
     * @returns {Promise}
     */
    unlinkAccount({ user, trx } = {}) {
        return SocialLink
            .where({
                user_id: user.get('id'),
                platform: SocialLink.SOURCES.GOOGLE
            })
            .destroy({
                transacting: trx
            })
            .then(() => user.load('social_links', { transacting: trx }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Resolves the given Google access token to the Google user id
     *
     * @param   {String}    auth_code   Google server auth code
     *
     * @returns {Promise}
     */
    resolveToken(jwt) {
        return new Promise((resolve, reject) => {
            let jwt_decoded = jsonwebtokens.decode(jwt, { complete: true });

            if (!jwt_decoded) {
                return reject(
                    ferror(ferror.INVALID_REQUEST).msg('Invalid Google JSON Web Token')
                );
            }

            // Fetch the Google OpenID Discovery document
            // NOTE this file cannot be stored locally, as it can change
            superagent
                .get('https://accounts.google.com/.well-known/openid-configuration')
                .set('Accept', 'application/json')
                .end((err, res) => {
                    if (err) {
                        return reject(err);
                    }

                    let openid_doc = res.body;
                    superagent
                        .get(openid_doc.jwks_uri)
                        .set('Accept', 'application/json')
                        .end((err, res) => {
                            if (err) {
                                return reject(err);
                            }

                            let jwk = res.body.keys.find(k => (k.kid === jwt_decoded.header.kid));

                            if (!jwk) {
                                return reject(
                                    ferror(ferror.INVALID_REQUEST).msg('Invalid Google JSON Web Token')
                                );
                            }

                            jsonwebtokens.verify(
                                jwt,
                                jwk2pem(jwk),
                                {
                                    algorithms: openid_doc.id_token_signing_alg_values_supported,
                                    issuer: openid_doc.issuer
                                },
                                (err, result) => {
                                    if (err) {
                                        if (err.name === 'TokenExpiredError') {
                                            reject(ferror(ferror.INVALID_REQUEST).msg('Expired Google JSON Web Token'));
                                        } else if (err.name === 'JsonWebTokenError') {
                                            reject(ferror(ferror.INVALID_REQUEST).msg('Invalid Google JSON Web Token'));
                                        } else {
                                            reject(err).type(ferror.API).msg('Unable to authenticate Google account!');
                                        }
                                    } else {
                                        resolve(result.sub)
                                    }
                                }
                            )
                        });
                });
        });
    }
}

module.exports = new Google;
