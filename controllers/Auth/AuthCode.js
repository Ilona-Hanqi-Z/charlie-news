'use strict';

const _ = require('lodash');
const AuthCodeModel = require('../../models/oauth_authorization_code');
const ClientModel = require('../../models/oauth_client');
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const Promise = require('bluebird');
const RoleModel = require('../../models/role');
const UserModel = require('../../models/user');

class OAuthAuthorizationCodeController {

    /**
     * Takes the access token(s) and formats them for serving,
     * returning the proper columns and relations for each.
     *
     * @param auth_code_models {Model|Model[]}
     * @param options {object}
     * @param options.filter {string[]}
     * @param options.show_role {bool}
     *
     * @returns {Promise<bookshelf.Model[]>}
     */
    build(auth_code_models, {
        user, outlet,

        filter = AuthCodeModel.FILTERS.PUBLIC,
        keep_fields = [],

        show_user = false,
        show_client = false,
        show_role = false,

        build_client = {},
        build_user = {},

        trx
    } = {}) {
        if (!auth_code_models) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(auth_code_models)) {
            isArr = false;
            auth_code_models = [auth_code_models];
        }
        if (!auth_code_models.length) return Promise.resolve(auth_code_models);

        // map: Hashmap, hash being the related id, and value being an array of post models that share that relationship
        // ids: Array of all post ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            tokens: { map: {}, ids: [] },
            roles: { build: [], map: {}, ids: [] },
            clients: { build: [], map: {}, ids: [] },
            users: { build: [], map: {}, ids: [] }
        };

        // Build array for resolving all relations at same time, also init each model
        for (let auth_code_model of auth_code_models) {
            let client_id = auth_code_model.get('client_id');
            let role_id = auth_code_model.get('role_id');
            let user_id = auth_code_model.get('user_id');

            // Model init
            auth_code_model.columns(filter.concat(keep_fields));
            auth_code_model.trigger('fetched', auth_code_model);

            references.tokens.ids.push(auth_code_model.get('id'));
            references.tokens.map[auth_code_model.get('id')] = auth_code_model;

            if (show_client) {
                if (!auth_code_model.related('client').isNew()) {
                    references.clients.build.push(auth_code_model.related('client'));
                } else {
                    auth_code_model.relations.client = ClientModel.nullable(); // Empty models represent null values

                    if (client_id) {
                        if (!references.clients.map[client_id]) {
                            references.clients.map[client_id] = [auth_code_model];
                            references.clients.ids.push(client_id);
                        } else {
                            references.clients.map[client_id].push(auth_code_model);
                        }
                    }
                }
            } else {
                delete auth_code_model.relations.client;
            }
            if (show_role) {
                if (!auth_code_model.related('role').isNew()) {
                    references.roles.build.push(auth_code_model.related('role'));
                } else {
                    auth_code_model.relations.role = RoleModel.nullable(); // Empty models represent null values

                    if (role_id) {
                        if (!references.roles.map[role_id]) {
                            references.roles.map[role_id] = [auth_code_model];
                            references.roles.ids.push(role_id);
                        } else {
                            references.roles.map[role_id].push(auth_code_model);
                        }
                    }
                }
            } else {
                delete auth_code_model.relations.role;
            }
            if (show_user) {
                if (!auth_code_model.related('user').isNew()) {
                    references.users.build.push(auth_code_model.related('user'));
                } else {
                    auth_code_model.relations.user = UserModel.nullable(); // Empty models represent null values

                    if (user_id) {
                        if (!references.users.map[user_id]) {
                            references.users.map[user_id] = [auth_code_model];
                            references.users.ids.push(user_id);
                        } else {
                            references.users.map[user_id].push(auth_code_model);
                        }
                    }
                }
            } else {
                delete auth_code_model.relations.user;
            }
        }

        return Promise
            .all([
                // User promise
                new Promise((yes, no) => {
                    if (!show_user) return yes();
                    UserModel.knex('users')
                        .whereIn('id', references.users.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _user = UserModel.forge(row);
                                references.users.map[row.id].forEach(token => token.relations.user = _user);
                                references.users.build.push(_user);
                            }

                            UserController
                                .build(user, references.users.build, Object.assign({
                                    filter: UserModel.FILTERS.PUBLIC,
                                    trx
                                }, build_user))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Client promise
                new Promise((yes, no) => {
                    if (!show_client) return yes();
                    ClientModel.knex('oauth_clients')
                        .whereIn('id', references.clients.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _client = ClientModel.forge(row);
                                references.clients.map[row.id].forEach(token => token.relations.client = _client);
                                references.clients.build.push(_client);
                            }

                            ClientController
                                .build(references.clients.build, Object.assign({
                                    user, outlet,
                                    filter: ClientModel.FILTERS.PUBLIC,
                                    show_api_version: true,
                                    show_family: true,
                                    show_role: true,
                                    trx
                                }, build_client))
                                .then(yes)
                                .catch(no);
                        })
                        .catch(no);
                }),
                // Role promise
                new Promise((yes, no) => {
                    if (!show_role) return yes();
                    RoleModel.knex('roles')
                        .select(RoleModel.FILTERS.PUBLIC)
                        .whereIn('id', references.roles.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _role = RoleModel.forge(row);
                                references.roles.map[row.id].forEach(client => client.relations.role = _role);
                                references.roles.build.push(_role);
                            }

                            references.roles.build.forEach(r => r.columns(RoleModel.FILTERS.PUBLIC));
                            yes();
                        })
                        .catch(no);
                }),
            ])
            .then(() => Promise.resolve(isArr ? auth_code_models : auth_code_models[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
    
    /**
     * Exchanges the given authorization code for an access token
     * 
     * @param {string} code Authorization code
     * @param {object} options
     * @param {bookshelf.Model} options.client
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise<bookshelf.Model>}
     */
    exchange(code, { client, trx } = {}) {
        let user_id, role_id;
        return AuthCodeModel
            .where({
                token: code,
                client_id: client.get('id')
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(model => {
                user_id = model.get('user_id');
                role_id = model.get('role_id');
                return model.destroy({ transacting: trx });
            })
            .then(() => AccessTokenController.generate(client, role_id, user_id, trx))
            .catch(AuthCodeModel.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Invalid authorization code. Authorization codes must be exchanged by the same client that was used to create them.')
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Generates a new oauth2 authorization code for granting access to
     * third party applications
     * 
     * @param {bookshelf.Model} client_model Client used to generate this token
     * @param {number} user_id ID of user granting access
     * @param {string} redirect_uri
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    generate({ client, role, role_id, redirect_uri, state = null } = {}, { user, trx } = {}) {
        if (client.get('redirect_uri') !== redirect_uri) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }
        if (!role_id) {
            if (role) {
                role_id = role.get('id');
            } else {
                return Promise.reject(
                    ferror(ferror.INVALID_REQUEST)
                        .msg('Missing token role/scope')
                );
            }
        }

        return AuthCodeModel
            .generateCode(trx)
            .then(code =>
                new AuthCodeModel({
                    user_id: user.get('id'),
                    role_id,
                    client_id: client.get('id'),
                    redirect_uri,
                    token: code,
                    state
                })
                .save(null, { transacting: trx })
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Fetches the authorization code by token
     * 
     * @param {string} token
     * @param {object} [options]
     * @param {boolean} [options.require=true]
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise<bookshelf.Model>}
     */
    resolve(token, { require = true, trx } = {}) {
        return AuthCodeModel
            .where({ token })
            .fetch({ require, transacting: trx})
            .catch(AuthCodeModel.NotFoundError, () =>
                Promise.reject(ferror(ferror.UNAUTHORIZED))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new OAuthAuthorizationCodeController;

const AccessTokenController = require('./AccessToken');
const ClientController = require('./Client');
const UserController = require('../User');