'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const Promise = require('bluebird');

const config = require('../../config');

const ferror = require('../../lib/frescoerror');

const UserSettings = require('../../models/user_settings');
const Installation = require('../../models/installation');
const InstallationSubscription = require('../../models/installation_subscription');

const SNS = new AWS.SNS({ apiVersion: '2010-03-31', region: 'us-east-1' });

class UserSettingsController {

    /**
     * Get the settings for the passed user
     * 
     * @param user_model {Model}
     * @param params {Object}
     * @param params.filter {String[]}
     * @param params.type {String} key of the setting to fetch
     * @param params.types {String[]} keys of the settings to fetch
     * @param params.types_like {String} postgresql LIKE query for fetching settings by key
     * 
     * @returns {Promise}
     */
    getByUser(user_model, params) {
        params.include_meta = true;
        return user_model.fetchSettings(params);
    }

    /**
     * Initializes the user's settings using the defaults
     * 
     * @param {bookshelf.Model} user_model
     * @param {object} settings any settings to apply 
     * @param {knex.Transaction} [trx]
     * 
     * @returns {bookshelf.Model} user_model with settings relation
     */
    initializeUser(user_model, settings = {}, trx) {
        return UserSettings.knex('setting_types')
            .select('type', 'options_default AS options')
            .transacting(trx)
            .then(rows =>
                Promise.map(rows, row => {
                    row.user_id = user_model.get('id')
                    if (settings[row.type]) {
                        row.options = Object.assign(row, settings[row.type])
                    }
                    return new UserSettings(row).save(null, { transacting: trx })
                })
            )
            .then(setting_models =>
                user_model
                    .installations()
                    .fetch({ transacting: trx })
                    .then(inst_coll =>
                        Promise.map(setting_models.filter(s => s.get('options').send_push === true), setting_model =>
                            InstallationController
                                .sub({
                                    installation_model: inst_coll.models,
                                    user_setting_model: setting_model
                                }, trx)
                        )
                    )
                    .then(() => setting_models)
            )
            .then(setting_models => {
                user_model.relations.settings = new UserSettings.Collection(setting_models)
                return user_model
            })
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    /**
     * Route controller for updating user settings
     * 
     * @param user_model {Model}
     * @param settings {Object}
     * @param trx {knex.Transaction}
     * 
     * @returns {Promise}
     */
    saveSettings(user_model, settings = {}, trx) {
        let push_settings = Object.keys(config.AWS.SNS.NOTIFICATIONS).map(n => 'notify-'+n)
        return user_model
            .installations()
            .fetch({ transacting: trx })
            .then(install_coll =>
                user_model
                    .fetchSettings({ types: Object.keys(settings) }, trx)
                    .then(setting_coll =>
                        Promise.each(setting_coll.models, setting_model => {
                            let changes = settings[setting_model.get('type')]
                            let previous = _.cloneDeep(setting_model.get('options'))
                            return setting_model
                                .save({
                                    options: Object.assign(setting_model.get('options'), settings[setting_model.get('type')])
                                }, {
                                    patch: true,
                                    transacting: trx
                                })
                                .then(setting_model => {
                                    if (
                                        !_.isObject(changes)
                                        || !_.isBoolean(changes.send_push)
                                        || previous.send_push === changes.send_push
                                    ) {
                                        return Promise.resolve(setting_model)
                                    } else if (setting_model.get('options').send_push) {
                                        return InstallationController
                                            .sub({
                                                installation_model: install_coll.models,
                                                user_setting_model: setting_model
                                            }, trx)
                                            .then(() => setting_model)
                                    } else {
                                        return InstallationController
                                            .unsub({
                                                installation_id: install_coll.models.map(i_m => i_m.get('id')),
                                                user_setting_id: setting_model.get('id')
                                            }, trx)
                                            .then(() => setting_model)
                                    }
                                })
                        })
                    )
            )
    }
}

module.exports = new UserSettingsController;

const InstallationController = require('./Installation')