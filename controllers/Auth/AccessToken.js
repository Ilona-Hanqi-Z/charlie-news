'use strict';

const _ = require('lodash');
const AccessTokenModel = require('../../models/oauth_access_token');
const ApiVersionModel = require('../../models/api_version');
const ClientModel = require('../../models/oauth_client');
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const OutletModel = require('../../models/outlet');
const Promise = require('bluebird');
const RoleModel = require('../../models/role');
const UserModel = require('../../models/user');

class OAuthAccessTokenController {

    /**
     * Takes the access token(s) and formats them for serving,
     * returning the proper columns and relations for each.
     *
     * @param token_models {Model|Model[]}
     * @param options {object}
     * @param options.filter {string[]}
     * @param options.show_role {bool}
     *
     * @returns {Promise<bookshelf.Model[]>}
     */
    build(token_models, {
        user, outlet,

        filter = AccessTokenModel.FILTERS.PUBLIC,
        keep_fields = [],

        show_client = false,
        show_role = false,
        show_user = false,

        build_client = {},
        build_user = {},

        trx
    } = {}) {
        if (!token_models) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(token_models)) {
            isArr = false;
            token_models = [token_models];
        }
        if (!token_models.length) return Promise.resolve(token_models);

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
        for (let token_model of token_models) {
            let client_id = token_model.get('client_id');
            let role_id = token_model.get('role_id');
            let user_id = token_model.get('user_id');

            // Model init
            token_model.columns(filter.concat(keep_fields));
            token_model.trigger('fetched', token_model);

            references.tokens.ids.push(token_model.get('id'));
            references.tokens.map[token_model.get('id')] = token_model;

            if (show_client) {
                if (!token_model.related('client').isNew()) {
                    references.clients.build.push(token_model.related('client'));
                } else {
                    token_model.relations.client = ClientModel.nullable(); // Empty models represent null values

                    if (client_id) {
                        if (!references.clients.map[client_id]) {
                            references.clients.map[client_id] = [token_model];
                            references.clients.ids.push(client_id);
                        } else {
                            references.clients.map[client_id].push(token_model);
                        }
                    }
                }
            } else {
                delete token_model.relations.client;
            }
            if (show_role) {
                if (!token_model.related('role').isNew()) {
                    references.roles.build.push(token_model.relations.role);
                } else {
                    token_model.relations.role = RoleModel.nullable(); // Empty models represent null values

                    if (role_id) {
                        if (!references.roles.map[role_id]) {
                            references.roles.map[role_id] = [token_model];
                            references.roles.ids.push(role_id);
                        } else {
                            references.roles.map[role_id].push(token_model);
                        }
                    }
                }
            } else {
                delete token_model.relations.role;
            }
            if (show_user) {
                if (!token_model.related('user').isNew()) {
                    references.users.build.push(token_model.relations.user);
                } else {
                    token_model.relations.user = UserModel.nullable(); // Empty models represent null values

                    if (user_id) {
                        if (!references.users.map[user_id]) {
                            references.users.map[user_id] = [token_model];
                            references.users.ids.push(user_id);
                        } else {
                            references.users.map[user_id].push(token_model);
                        }
                    }
                }
            } else {
                delete token_model.relations.user;
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
            .then(() => Promise.resolve(isArr ? token_models : token_models[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Migrates the given access token to the client passed in through the request context.
     * The new client must be within the same family as the token's original client.
     * 
     * @param {AccessTokenModel} token_model
     * @param {object} context
     * @param {ClientModel} context.client
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<AccessTokenModel>}
     */
    migrateClient(token_model, { client, trx } = {}) {
        if (!token_model) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        let _promise = Promise.resolve();

        if (token_model.related('client').isNew()) {
            _promise = token_model.load(['client'], { transacting: trx });
        }

        return _promise
            .then(() => {
                if (!token_model.related('client').has('family_id') || token_model.related('client').get('family_id') !== client.get('family_id')) {
                    return Promise.reject(ferror(ferror.FORBIDDEN));
                }

                return token_model
                    .save({
                        client_id: client.get('id')
                    }, {
                        patch: true,
                        transacting: trx
                    })
                    .then(token_model => token_model.load('client', { transacting: trx }));
            })
            .catch(err => Promise.reject(err));
    }

    /**
     * Generate an oauth2 access token for authentication
     * 
     * @param {bookshelf.Model} client_model client used to generate this token
     * @param {(number)} role_id user this token represents. Null if token does not represent a user.
     * @param {(number|null)} user_id user this token represents. Null if token does not represent a user.
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    generate(client_model, role_id, user_id, trx) {
        return AccessTokenModel
            .generateTokens(trx)
            .then(([token, refresh_token] = []) =>
                AccessTokenModel
                    .forge({
                        token,
                        refresh_token,
                        role_id,
                        user_id,
                        client_id: client_model.get('id'),
                        expires_at: new Date(Date.now() + config.SERVER.OAUTH2.EXPIRES_IN_MS)
                    })
                    .save(null, { transacting: trx })
            )
            .then(token_model =>
                AccessTokenModel
                    .forge({ id: token_model.get('id') })
                    .fetch({
                        withRelated: ['client', 'client.api_version', 'client.role'],
                        transacting: trx
                    })
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Refreshes the auth token associated with the provided refresh token
     * 
     * @param {string} refresh_token
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    refresh(refresh_token, trx) {
        return AccessTokenModel
            .query(qb => {
                qb.where('refresh_token', refresh_token);
            })
            .fetch({
                require: true,
                transacting: trx
            })
            .then(token_model =>
                AccessTokenModel
                    .generateTokens(trx)
                    .then(([token, refresh_token] = []) =>
                        token_model
                            .save({
                                token,
                                refresh_token,
                                expires_at: new Date(Date.now() + config.SERVER.OAUTH2.EXPIRES_IN_MS)
                            }, {
                                patch: true,
                                transacting: trx
                            })

                    )
            )
            .catch(AccessTokenModel.NotFoundError, () => Promise.resolve(false))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Get the model associated with the given access token
     * This fetches the user and the user's outlet who this
     * token refers to.
     * 
     * @param {string} token
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    resolve(token, trx) {
        return AccessTokenModel
            .where('token', token)
            .fetch({
                columns: AccessTokenModel.FILTERS.SAFE,
                require: true,
                withRelated: [
                    'client',
                    'client.api_version',
                    { 'client.api_version': qb => qb.select(ApiVersionModel.FILTERS.PUBLIC) },
                    'client.role',
                    'role',
                    { 'user': qb => qb.select(UserModel.FILTERS.SAFE) },
                    'user.outlet',
                    { 'user.outlet.owner': qb => qb.select(UserModel.FILTERS.SAFE) },
                    'user.roles'
                ],
                transacting: trx
            })
            .catch(AccessTokenModel.NotFoundError, () =>
                Promise.reject(ferror(ferror.UNAUTHORIZED))
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new OAuthAccessTokenController;
module.exports.model = AccessTokenModel;

const ClientController = require('./Client');
const UserController = require('../User');