'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const winston = require('../../lib/winston');

const Installation = require('../../models/installation');
const InstallationSubscription = require('../../models/installation_subscription');
const Promise = require('bluebird');

const SNS = new AWS.SNS({ apiVersion: '2010-03-31', region: 'us-east-1' });

class InstallationController {

    getEndpoints(user_model, trx) {
        return Installation
            .query(qb => {
                qb.where('user_id', user_model.get('id'));
            })
            .fetchAll({ transacting: trx })
            .then(installations => {
                if (installations == null) {
                    return null;
                }
                return installations.map(inst => inst.get('sns_endpoint_arn'));
            });
    }

    /**
     * Signs a user out, deleting their auth token and disassociating
     * their account from the installation related to that auth token
     * 
     * TODO Have this endpoint manually 
     * 
     * @param bearer_model {bookshelf.Model}
     * @param trx {knex.Transaction} optional
     * 
     * @returns {Promise({ result: 'ok' }, ferror)}
     */
    disassociate(installation_id, trx) {
        return Installation
            .forge({ id: bearer_model.get('installation_id') })
            .save({ user_id: null }, { patch: true, transacting: trx })
            .then(() => Promise.resolve({ result: 'ok' }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Create or update an installation on the user
     * 
     * @param user_model {bookshelf.Model}
     * @param params {object}
     * @param params.app_version {string}
     * @param params.platform {string}
     * @param params.device_token {string}
     * @param params.old_device_token {string|null}
     * @param params.timezone {string|null} (Ex. America/New_York)
     * @param params.locale {string|null} (Ex. en-us)
     * @param trx {knex.Transaction}
     * @returns {Promise}
     */
    upsert(user_model, installation_params = {}, trx) {
        const self = this
        let renew_globals = false;
        let is_update = false;
        let prev_data = { user_id: '', device_token: '', platform: '' };

        return Installation
            .query(qb => {
                qb.where('device_token', installation_params.device_token);
                if (installation_params.old_device_token) {
                    qb.orWhere('device_token', installation_params.old_device_token);
                }
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(updateInstallation)
            .catch(Installation.NotFoundError, createInstallation)
            .catch(err => Promise.reject(ferror.constraint(err)));

        function createInstallation() {
            let installation_model = new Installation(installation_params);
            if (user_model) {
                renew_globals = true;
                installation_model.set('user_id', user_model.get('id'));
            }

            return makeARN(installation_model)
                .then(() => installation_model.save(null, {
                    method: 'insert',
                    transacting: trx
                }))
                .then(subscribeToGlobalTopics)
        }

        function updateInstallation(installation_model) {
            is_update = true;
            prev_data.user_id = installation_model.get('user_id');
            prev_data.device_token = installation_model.get('device_token');
            prev_data.platform = installation_model.get('platform');

            if (installation_model.get('user_id') !== user_model.get('id')) {
                renew_globals = true;
                installation_model.set('user_id', user_model.get('id'));
            }

            installation_model.set('updated_at', new Date());
            installation_model.set('device_token', installation_params.device_token);
            if (installation_params.app_version) installation_model.set('app_version', installation_params.app_version);
            if (installation_params.platform) installation_model.set('platform', installation_params.platform);
            if (installation_params.timezone) installation_model.set('timezone', installation_params.timezone);
            if (installation_params.locale) installation_model.set('locale', installation_params.locale);

            return updateARN(installation_model)
                .then(() =>
                    (renew_globals)
                        ? unsubARN(installation_model)
                            .then(() => subscribeToGlobalTopics(installation_model, trx))
                        : Promise.resolve()
                )
                .then(() => installation_model.save(null, { method: 'update', transacting: trx }))
        }

        function unsubARN(installation_model) {
            return user_model
                .fetchSettings({ types_like: 'notify-' })
                .then(coll =>
                    installation_model
                        .subscriptions()
                        .fetch({ transacting: trx })
                        .then(coll =>
                            Promise.each(coll.models, sub =>
                                self.unsub({ subscription_model: sub }, trx)
                            )
                        )
                )
        }

        function updateARN(installation_model) {
            if (!installation_model.has('sns_endpoint_arn')) {
                return makeARN(installation_model);
            }

            return new Promise((yes, no) => {
                SNS.setEndpointAttributes({
                    Attributes: {
                        Enabled: 'true',
                        Token: installation_model.get('device_token')
                    },
                    EndpointArn: installation_model.get('sns_endpoint_arn')
                }, (err, result) => {
                    if (err) {
                        // If the endpoint doesn't exist, make it
                        if (err.message && err.message.startsWith('Endpoint does not exist')) {
                            makeARN(installation_model)
                                .then(yes)
                                .catch(no);
                        } else {
                            no(ferror(err));
                        }
                    }
                    else {
                        yes();
                    }
                });
            });
        }

        function makeARN(installation_model) {
            return new Promise((yes, no) => {
                SNS.createPlatformEndpoint({
                    PlatformApplicationArn: installation_model.get('platform') === 'android'
                                                ? config.AWS.SNS.ANDROID_PLATFORM_ARN
                                                : config.AWS.SNS.IOS_PLATFORM_ARN,
                    Token: installation_model.get('device_token'),
                    Attributes: {
                        CustomUserData: JSON.stringify({
                            user_id: installation_model.get('user_id')
                        })
                    }
                }, (err, data) => {
                    if (err) {
                        // If an endpoint already exists with that device_token, reuse it
                        if (err.message && err.message.startsWith('Invalid parameter: Token Reason: Endpoint')) {
                            // SNS doesn't have a nice way to get the endpoint a device token belongs to, so we have to
                            // parse it from the error message.
                            let endpoint = err.message.split(' ')[5];
                            SNS.setEndpointAttributes({
                                Attributes: {
                                    CustomUserData: JSON.stringify({
                                        user_id: installation_model.get('user_id')
                                    }),
                                    Enabled: 'true'
                                },
                                EndpointArn: endpoint
                            }, (e, d) => {
                                if(e) {
                                    return failure(e);
                                }
                                success(d.EndpointArn);
                            });
                        }
                        else {
                            failure(err);
                        }
                    } else {
                        success(data.EndpointArn);
                    }

                    function success(endpoint) {
                        installation_model.set('sns_endpoint_arn', endpoint);

                        if (trx && trx.additional_rollbacks && is_update) {
                            trx.additional_rollbacks.push(() => rollbackCreate(endpoint).then(() => rollbackDelete(prev_data)));
                        }
                        else if (trx && trx.additional_rollbacks) {
                            trx.additional_rollbacks.push(() => rollbackCreate(endpoint));
                        }

                        yes();
                    }

                    function failure(error) {
                        if (trx && trx.additional_rollbacks && is_update) {
                            trx.additional_rollbacks.push(() => rollbackDelete(prev_data));
                        }
                        no(ferror(error).type(ferror.API).msg('Could not create token subscription'));
                    }
                });
            });
        }

        function subscribeToGlobalTopics(installation_model, new_trx) {
            let _trx = new_trx ? new_trx : trx;

            if (!renew_globals) {
                return Promise.resolve(installation_model);
            }

            let notification_settings = Object.keys(config.AWS.SNS.NOTIFICATIONS).map(s => 'notify-' + s);
            return user_model
                .fetchSettings({ types: notification_settings }, _trx)
                .then(({ models: user_settings }) => {
                    user_settings = user_settings.filter(u_s => u_s.get('options').send_push == true);
                    return Promise
                        .each(user_settings, setting_model =>
                            self.sub({
                                installation_model,
                                user_setting_model: setting_model,
                                topic_arn: config.AWS.SNS.NOTIFICATIONS[setting_model.get('type').substr(7)]
                            }, _trx)
                        )
                })
                .then(() => Promise.resolve(installation_model));
        }

        function rollbackCreate(endpoint_arn) {
            return Installation
                .where('device_token', installation_params.device_token)
                .fetch()
                .then(model => new Promise((rbYes, rbNo) => {

                    // Don't rollback the endpoint if the installation actually exists outside of the transaction
                    if (model) {
                        winston.info(`Not rolling back endpoint: ${endpoint_arn}`);
                        return rbYes();
                    }

                    // Debug info, trying to fix installation errors
                    winston.info(`Attempting to rollback endpoint creation: ${endpoint_arn}`);

                    SNS.deleteEndpoint({
                        EndpointArn: endpoint_arn
                    }, (rbErr) => {
                        winston.info(`Endpoint rolled back: ${endpoint_arn}`);
                        return rbErr ? rbNo(rbErr) : rbYes()
                    })
                }));
        }

        function rollbackDelete(installation_data) {
            return Installation.knex.transaction(_trx => {
                return new Promise((rbYes, rbNo) => {
                    SNS.createPlatformEndpoint({
                        PlatformApplicationArn: installation_data.platform === 'android'
                            ? config.AWS.SNS.ANDROID_PLATFORM_ARN
                            : config.AWS.SNS.IOS_PLATFORM_ARN,
                        Token: installation_data.device_token,
                        Attributes: {
                            CustomUserData: JSON.stringify({
                                user_id: installation_data.user_id
                            })
                        }
                    }, (err, data) => {
                        if (err) return _trx.rollback();

                        Installation
                            .where('device_token', installation_data.device_token)
                            .fetch({ transacting: _trx })
                            .then(i_model => {
                                i_model.set('sns_endpoint_arn', data.EndpointArn);
                                return i_model.save(null, { method: 'update', transacting: _trx });
                            })
                            .then(i_model => subscribeToGlobalTopics(i_model, _trx))
                            .then(rbYes)
                            .catch(rbNo)
                    })
                }).then(_trx.commit).catch(_trx.rollback);
            });
        }
    }

    /**
     * Unsubscribes installations from SNS topics
     * 
     * NOTE if the setting type passed has no associated topic which
     * to subscribe to, function returns successfully
     * 
     * @param {object} params
     * @param {(bookshelf.Model|bookshelf.Model[])} params.installation_model installation(s) to affect
     * @param {string} [params.user_setting_model] the user's setting object
     * @param {string} params.topic_arn the AWS SNS topic ARN to subscribe to
     * @param {knex.Transaction} [trx]
     * 
     * @returns {bookshelf.Model} installation model
     */
    sub({
        installation_model,
        user_setting_model,
        topic_arn
    } = {}, trx) {
        if (_.isArray(installation_model)) {
            return Promise.map(installation_model, i_m =>
                this.sub({
                    installation_model: i_m,
                    user_setting_model,
                    topic_arn
                }, trx)
            )
        }
        if ((!user_setting_model && !topic_arn) || !installation_model) {
            return Promise.reject(
                ferror(ferror.INVALID_REQUEST)
                    .msg('Missing or invalid subscriptions')
            )
        }

        if (user_setting_model && !user_setting_model.get('options').send_push) {
            return Promise.resolve(installation_model)
        }

        if (user_setting_model) {
            topic_arn = config.AWS.SNS.NOTIFICATIONS[user_setting_model.get('type').substr(7)]
            if (!topic_arn) {
                return Promise.resolve(installation_model)
            }
        }

        return new Promise((yes, no) => {
            SNS.subscribe({
                Protocol: 'application',
                TopicArn: topic_arn,
                Endpoint: installation_model.get('sns_endpoint_arn')
            }, (err, data) => {
                if (err) {
                    if (err.code === 'InvalidParameter') {
                        yes() // TODO should this do something? Maybe delete installation object?
                    } else {
                        no(ferror(err).msg('Could not subscribe to topic'));
                    }
                } else if (user_setting_model) {
                    Installation.knex
                        .raw(`
                            INSERT INTO installation_subscriptions
                            (installation_id, user_setting_id, subscription_arn) VALUES (?, ?, ?)
                            ON CONFLICT (installation_id, user_setting_id)
                            DO UPDATE SET subscription_arn = ?;
                        `, [
                            installation_model.get('id'),
                            user_setting_model.get('id'),
                            data.SubscriptionArn,
                            data.SubscriptionArn
                        ])
                        .transacting(trx)
                        .then(() => yes(installation_model))
                        .catch(ferror.constraint(no))
                } else {
                    yes(installation_model)
                }
            })
        })
    }

    /**
     * Unsubscribes the installation from the provided topics
     * 
     * NOTE if there is no subscription object found for this installation
     * for this setting, the fucntion returns successfully
     * 
     * @param {bookshelf.Model} [subscription_model] installation's subscription model
     * @param {(number|number[])} [installation_id] installation's ID to unsubscribe
     * @param {number} [user_setting_id] user's setting that identifies the subscription
     * @param {knex.Transaction} [trx]
     * 
     * @returns {(null|bookshelf.Model)} deleted subscription model
     */
    unsub({ subscription_model, installation_id, user_setting_id } = {}, trx) {
        if (!subscription_model) {
            if (installation_id && user_setting_id) {
                if (_.isArray(installation_id)) {
                    return Promise.map(installation_id, id => this.unsub({
                        installation_id: id,
                        user_setting_id
                    }, trx))
                }

                return InstallationSubscription
                    .where({ installation_id, user_setting_id })
                    .fetch({ transacting: trx })
                    .then(s => this.unsub({ subscription_model: s }, trx))
            } else {
                return Promise.resolve()
            }
        }

        return new Promise((yes, no) => {
            SNS.unsubscribe({
                SubscriptionArn: subscription_model.get('subscription_arn')
            }, (err, data) => {
                if (err) {
                    if (err.code === 'InvalidParameter') {
                        yes() // TODO should this do something? Maybe delete installation object?
                    } else {
                        no(ferror(err).msg('Could not unsubscribe from topic'));
                    }
                } else {
                    InstallationSubscription
                        .where({
                            installation_id: subscription_model.get('installation_id'),
                            user_setting_id: subscription_model.get('user_setting_id')
                        })
                        .destroy({ transacting: trx })
                        .then(() => yes(subscription_model), ferror.constraint(no))
                }
            })
        })
    }
}

module.exports = new InstallationController;

const UserSettingsController = require('./Settings');