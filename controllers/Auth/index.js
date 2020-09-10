'use strict';

const _ = require('lodash');
const config = require('../../config');
const crypto = require('crypto');
const ferror = require('../../lib/frescoerror');
const hashids = require('../../lib/hashids');
const reporter = require('../../lib/reporter');

const Installation = require('../../models/installation');
const OAuthAccessToken = require('../../models/oauth_access_token');
const Outlet = require('../../models/outlet');
const Promise = require('bluebird');
const RoleModel = require('../../models/role');
const User = require('../../models/user');

class AuthController {

    /**
     * TODO DEPRECATED
     * Registers user
     *
     * @param data
     * @param data.email (required)
     * @param data.username (required)
     * @param data.password (required)
     * @param data.full_name
     * @param data.bio
     * @param data.phone
     * @param data.avatar
     * @param data.twitter_handle
     * @param data.verification_token
     * @param data.social_links
     * @param data.social_links[platform][token]
     * @param data.social_links[platform][secret]
     * 
     * @param data.oauth_client
     *
     * Installation parameter group (optional):
     *
     * @param data.installation.app_version (required)
     * @param data.installation.platform (required)
     * @param data.installation.device_token
     * @param data.installation.timezone
     * @param data.installation.locale_identifier
     *
     * Outlet parameter group (optional):
     * @param data.outlet.title
     * @param data.outlet.link
     *
     * @returns {Promise}
     */
    register(data, trx) {
        if (data.username && data.username.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('username').msg('Username cannot contain spaces'));
        }
        if (data.email && data.email.includes(' ')) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).param('email').msg('Email cannot contain spaces'));
        }

        let user_model = new User(data);

        return user_model
            .save(null, { transacting: trx })
            .then(makeInstallation)
            .then(installation_model => Promise.all([
                TermsController.agreeToTerms(user_model, trx),
                makeAccessToken(),
                makeOutlet(),
                linkSocial(),
                user_model.identity().save(null, { method: 'insert', transacting: trx }),
                UserController.Settings.initializeUser(user_model, {}, trx),
                giveRoles("user"),
            ]))
            .then(([terms, token_model] = []) => {

                //Send welcome email to new users (after a delay)
                NotificationController.Mediums.Delayed
                    .send({
                        type: 'user-new',
                        key: user_model.get('id'),
                        delay: config.APPLICATION.DELAYS.NEW_USER,
                        fields: {
                            user_id: user_model.get('id')
                        }
                    })
                    .catch(reporter.report);

                return Promise.resolve({
                    user: user_model,
                    terms,
                    token: token_model.get('token'),
                    refresh_token: token_model.get('refresh_token')
                });
            })
            .catch(err => Promise.reject(ferror.constraint(err)));

        function giveRoles(tags = []) {
            if (!_.isArray(tags)) tags = [tags];

            return RoleModel
                .where('tag', 'IN', tags)
                .fetchAll({ transacting: trx })
                .then(collection =>
                    user_model.related('roles').attach(collection.models, { transacting: trx })
                )
        }

        function makeInstallation() {
            if (!data.installation || !data.installation.device_token) return Promise.resolve();
            data.installation.user_id = user_model.get('id');
            return UserController.Installation
                .upsert(user_model, data.installation, trx);
        }

        function makeOutlet() {
            if(!data.outlet) return Promise.resolve();

            if(data.outlet.token) {
                return OutletController.Members.join(user_model, data.outlet.token, trx)
            } else {
                return OutletController.create(user_model, data.outlet, trx);
            }
        }

        function linkSocial() {
            if (!data.social_links) return Promise.resolve();
            let promises = []

            if (data.social_links.twitter) {
                promises.push(
                    SocialController.Twitter
                        .linkAccount(data.social_links.twitter, { trx, user: user_model })
                );
            }
            if (data.social_links.facebook) {
                promises.push(
                    SocialController.Facebook
                        .linkAccount(data.social_links.facebook, { trx, user: user_model })
                );
            }
            if (data.social_links.google) {
                promises.push(
                    SocialController.Google
                        .linkAccount(data.social_links.google, { trx, user: user_model })
                );
            }

            return Promise.all(promises);
        }

        function makeAccessToken() {
            return module.exports.Role
                .getOne({ tag: 'write' }, { trx })
                .then(role_model => {
                    return module.exports.AccessToken
                        .generate(data.oauth_client, role_model.get('id'), user_model.get('id'), trx);
                })
        }
    }

    /**
     * Signs a user in with validated credentials. 
     * New access token is created and old ones are invalidated.
     *
     * @param {object} params
     * @param {string} params.username
     * @param {string} params.password
     * @param {bookshelf.Model} params.client
     * @param {(object|null)} params.installation
     * 
     * @returns {Promise}
     */
    signin({ username, password, installation, client = {} } = {}, trx) {
        let user_model;

        return UserController
            .login(username, password, trx)
            .then(model =>
                (model === false)
                    ? Promise.reject(ferror(ferror.UNAUTHORIZED).msg('Invalid username or password'))
                    : Promise.resolve(user_model = model)
            )
            .then(() =>
                Promise.all([
                    UserController.isValidV2User(user_model, trx), // Check if user was created in v2 (versus v1)
                    makeAccessToken(), // Make account access token
                    TermsController.fetchTerms(user_model), // Fetch the terms for the account
                    UserController.enable(user_model, {}, trx), // Enable account if it was disabled
                    makeInstallation(), // Make the installation object for this user
                ])
            )
            .then(([valid_password, token_model, terms] = []) => Promise.resolve({
                token: token_model.get('token'),
                refresh_token: token_model.get('refresh_token'),
                user: user_model,
                terms,
                valid_password
            }));

        function makeInstallation() {
            if (!installation || !installation.device_token) return Promise.resolve();
            installation.user_id = user_model.get('id');
            return UserController.Installation.upsert(user_model, installation, trx);
        }

        function makeAccessToken() {
            return module.exports.Role
                .getOne({ tag: 'write' }, { trx })
                .then(role_model => {
                    return module.exports.AccessToken
                        .generate(client, role_model.get('id'), user_model.get('id'), trx);
                })
        }
    }

    /**
     * Signs a user in with social creds. New access token is created and old ones are invalidated.
     * If social user already exists, update token is sent.
     * 
     * TODO DEPRECATED
     *
     * @param params
     * @param params.client
     * @param params.token
     * @param params.secret (Twitter)
     * @param params.jwt (Google)
     * @param params.installation
     * @param params.platform
     * @returns {Promise}
     */
    socialSignin({ client, token, secret, jwt, platform, installation } = {}, trx) {
        function socialErr(err) {
            if (err.type === ferror.NOT_FOUND) {
                return Promise.reject(ferror(ferror.UNAUTHORIZED));
            } else {
                return Promise.reject(err);
            }
        }

        let social_promise;

        if (platform === 'facebook') {
            social_promise = SocialController.Facebook.resolveAccount(token, trx);
        } else if (platform === 'twitter') {
            social_promise = SocialController.Twitter.resolveAccount(token, secret, trx);
        } else if (platform === 'google') {
            social_promise = SocialController.Google.resolveAccount(jwt, trx);
        } else {
            social_promise = Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Invalid social media platform')
                    .value(platform)
            )
        }

        return social_promise
            .then(user =>
                (!user)
                    ? Promise.reject(
                        ferror(ferror.UNAUTHORIZED)
                            .msg('Social account is not linked to a Fresco user')
                    )
                    : Promise
                        .all([
                            UserController.isValidV2User(user, trx),
                            TermsController.fetchTerms(user),
                            makeAccessToken(user),
                            UserController.enable(user, {}, trx),
                            makeInstallation(user)
                        ])
                        .then(([valid_password, terms, token_model] = []) =>
                            Promise.resolve({
                                token: token_model.get('token'),
                                refresh_token: token_model.get('refresh_token'),
                                user,
                                terms,
                                valid_password
                            })
                        )
            );

        function makeInstallation(user_model) {
            if (!installation || !installation.device_token) {
                return Promise.resolve();
            } else {
                installation.user_id = user_model.get('id');
                return UserController.Installation.upsert(user_model, installation, trx);
            }
        }

        function makeAccessToken(user_model) {
            return module.exports.Role
                .getOne({ tag: 'write' }, { trx })
                .then(role_model => {
                    return module.exports.AccessToken
                        .generate(client, role_model.get('id'), user_model.get('id'), trx);
                })
        }
    }

    /**
     * Set's password reset token for the passed email or username, then send notif out
     * @description Will check if the account exists and send back appropriate response
     * @return {Promise} resolve —- sent successfully, reject -- failed to send
     */
    requestPasswordReset(user, trx) {
        let reset_token = crypto.randomBytes(32).toString('hex');

        return User
            .query(qb => {
                qb
                    .whereRaw('LOWER(username) = ?', [user])
                    .orWhereRaw('LOWER(email) = LOWER(?)', [user]); 
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(User.NotFoundError, () => Promise.reject(ferror(ferror.NOT_FOUND).msg('User not found')))
            .then(user_model =>
                user_model.save({
                    reset_token
                }, {
                    patch: true,
                    transacting: trx
                })
            )
            .then(notify)
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));

        function notify(user_model) {
            const changePassword = NotificationController.Mediums.Email.createEmailLink({
                link: `reset/${user_model.get('reset_token')}`,
                content: 'Click here to change your password',
                referral: {
                    type: 'email',
                    email_name: 'password-reset'
                }
            });
            return NotificationController.Mediums.Email
                .send(user_model.get('email'), {
                    subject: 'Reset your Fresco password',
                    body: `Hi ${user_model.get('full_name') || user_model.get('username')},
                    <br/>We received a request to reset the password for your account.
                    ${changePassword}`
                })
                .catch(reporter.report);
        }
    }

    /**
     * Updates the user's password with the provided token
     * @param  {String} token    Reset token
     * @param  {String} password New password
     * @return {Promise}
     */
    updatePassword(reset_token, password, trx) {
        return this
            .getPasswordResetUser(reset_token, trx)
            .then(user_model =>
                user_model.save({
                    password
                }, {
                    patch: true,
                    transacting: trx
                })
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Retrieves user associated with password reset token
     */
    getPasswordResetUser(reset_token, trx) {
        return User
            .where('reset_token', reset_token)
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(User.NotFoundError, () =>
                Promise.reject(ferror(ferror.NOT_FOUND).msg('Invalid password reset token'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    checkSocial({ token, secret, jwt, platform } = {}, { trx } = {}) {
        function socialErr(err) {
            if (err.type == ferror.NOT_FOUND) {
                return Promise.reject(ferrer(ferror.UNAUTHORIZED));
            }
            else {
                return Promise.reject(err);
            }
        }

        let social_promise;

        if (platform === 'facebook') {
            social_promise = SocialController.Facebook.resolveAccount(token, trx);
        } else if (platform === 'twitter') {
            social_promise = SocialController.Twitter.resolveAccount(token, secret, trx);
        } else if (platform === 'google') {
            social_promise = SocialController.Google.resolveAccount(jwt, trx);
        } else {
            social_promise = Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Invalid social media platform')
                    .value(platform)
            );
        }

        return social_promise
            .then(user => {
                if (user) {
                    return Promise.reject(
                        ferror(ferror.FAILED_REQUEST)
                            .msg('Social Account is already linked to a Fresco User')
                    );
                }
                else {
                    return { success: 'ok' };
                }
            });
    }
}

module.exports = new AuthController;
module.exports.Client = require('./Client');
module.exports.AccessToken = require('./AccessToken');
module.exports.AuthorizationCode = require('./AuthCode');
module.exports.Role = require('./Role');

// avoid circular requires
const OutletController = require('../Outlet');
const SocialController = require('../Social');
const NotificationController = require('../Notification');
const StripeController = require('../Stripe');
const UserController = require('../User');
const TermsController = require('../Terms');