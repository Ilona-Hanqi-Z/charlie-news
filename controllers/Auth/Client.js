'use strict';

const _ = require('lodash');
const AccessTokenModel = require('../../models/oauth_access_token');
const ApiVersionModel = require('../../models/api_version');
const OAuthClient = require('../../models/oauth_client');
const config = require('../../config');
const ferror = require('../../lib/frescoerror');
const RoleModel = require('../../models/role');
const OutletModel = require('../../models/outlet');
const Promise = require('bluebird');
const UserModel = require('../../models/user');
const ClientFamilyModel = require('../../models/oauth_client_family');

class OAuthClientController {

    /**
     * Takes the client(s) and formats them for serving,
     * returning the proper columns and relations for each.
     *
     * @param user_model {Model}
     * @param client_models {Model|Model[]}
     * @param options {object}
     * @param options.filter {string[]}
     * @param options.show_api_version {bool}
     * @param options.show_role {bool}
     *
     * @returns {Promise<bookshelf.Model[]>}
     */
    build(client_models, {
        filter = OAuthClient.FILTERS.PUBLIC,
        keep_fields = [],

        show_api_version = false,
        show_role = false,
        show_family = false,

        trx
    } = {}) {
        if (!client_models) return Promise.resolve();

        let isArr = true;
        if (!_.isArray(client_models)) {
            isArr = false;
            client_models = [client_models];
        }
        if (!client_models.length) return Promise.resolve(client_models);

        // map: Hashmap, hash being the related id, and value being an array of post models that share that relationship
        // ids: Array of all post ids that need this relationship resolved
        // build: Array of models to call the respective Controller#build function on, after fetching all relations
        let references = {
            clients: { map: {}, ids: [] },
            api_versions: { build: [], map: {}, ids: [] },
            roles: { build: [], map: {}, ids: [] },
            families: { build: [], map: {}, ids: [] }
        };

        // Build array for resolving all relations at same time, also init each model
        for (let client_model of client_models) {
            let api_version_id = client_model.get('api_version_id');
            let role_id = client_model.get('role_id');
            let family_id = client_model.get('family_id');

            // Model init
            client_model.columns(filter.concat(keep_fields));
            client_model.trigger('fetched', client_model);

            references.clients.ids.push(client_model.get('id'));
            references.clients.map[client_model.get('id')] = client_model;

            if (show_api_version) {
                if (!client_model.related('api_version').isNew()) {
                    references.api_versions.build.push(client_model.related('api_version'));
                } else {
                    client_model.relations.api_version = ApiVersionModel.nullable(); // Empty models represent null values

                    if (api_version_id) {
                        if (!references.api_versions.map[api_version_id]) {
                            references.api_versions.map[api_version_id] = [client_model];
                            references.api_versions.ids.push(api_version_id);
                        } else {
                            references.api_versions.map[api_version_id].push(client_model);
                        }
                    }
                }
            } else {
                delete client_model.relations.api_version;
            }
            if (show_role) {
                if (!client_model.related('role').isNew()) {
                    references.roles.build.push(client_model.relations.role);
                } else {
                    client_model.relations.role = RoleModel.nullable(); // Empty models represent null values

                    if (role_id) {
                        if (!references.roles.map[role_id]) {
                            references.roles.map[role_id] = [client_model];
                            references.roles.ids.push(role_id);
                        } else {
                            references.roles.map[role_id].push(client_model);
                        }
                    }
                }
            } else {
                delete client_model.relations.role;
            }
            if (show_family) {
                if (!client_model.related('family').isNew()) {
                    references.families.build.push(client_model.relations.family);
                } else {
                    client_model.relations.family = ClientFamilyModel.nullable(); // Empty models represent null values

                    if (family_id) {
                        if (!references.families.map[family_id]) {
                            references.families.map[family_id] = [client_model];
                            references.families.ids.push(family_id);
                        } else {
                            references.families.map[family_id].push(client_model);
                        }
                    }
                }
            } else {
                delete client_model.relations.family;
            }
        }

        return Promise
            .all([
                // Api version promise
                new Promise((yes, no) => {
                    if (!show_api_version) return yes();
                    ApiVersionModel.knex('api_versions')
                        .whereIn('id', references.api_versions.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _api_version = ApiVersionModel.forge(row);
                                references.api_versions.map[row.id].forEach(client => client.relations.api_version = _api_version);
                                references.api_versions.build.push(_api_version);
                            }

                            references.api_versions.build.forEach(v => v.columns(ApiVersionModel.FILTERS.PUBLIC));
                            yes();
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
                // Family promise
                new Promise((yes, no) => {
                    if (!show_family) return yes();
                    ClientFamilyModel.knex('oauth_client_families')
                        .select('*')
                        .whereIn('id', references.families.ids)
                        .transacting(trx)
                        .then(rows => {
                            for (let row of rows) {
                                let _family = ClientFamilyModel.forge(row);
                                references.families.map[row.id].forEach(client => client.relations.family = _family);
                                references.families.build.push(_family);
                            }

                            references.families.build.forEach(r => r.columns(ClientFamilyModel.FILTERS.PUBLIC));
                            yes();
                        })
                        .catch(no);
                }),
            ])
            .then(() => Promise.resolve(isArr ? client_models : client_models[0]))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Gets oauth client with its version information
     *
     * @param {string} client_id
     * @param {string} client_secret
     * @param {knex.Transacting} [trx]
     * 
     * @returns {bookshelf.Model}
     */
    authenticate(client_id, client_secret, trx) {
        return OAuthClient
            .where({ client_id, client_secret })
            .fetch({
                columns: OAuthClient.FILTERS.SAFE,
                require: true,
                transacting: trx,
                withRelated: [
                    'api_version',
                    'role',
                    'outlet',
                    { 'outlet.owner': qb => qb.select(UserModel.FILTERS.SAFE) }
                ]
            })
            .catch(OAuthClient.NotFoundError, () =>
                Promise.reject(ferror(ferror.UNAUTHORIZED))
            )
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }

    /**
     * Created a new OAuth2 client
     * 
     * @param {bookshelf.Model} user_model user creating the client
     * @param {object} params client parameters
     * @param {string} params.client_id MUST be unique
     * @param {number} params.api_version_id
     * @param {int} params.role_id client role
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    create({ outlet_id = null, family_id = null, role_id, api_version_id, redirect_uri, tag } = {}, { user, trx } = {}) {
        if (!user) {
            return Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Missing user'));
        }

        let isAdmin = (user != null && user.can('admin', 'create', 'client'));
        if (!isAdmin && (user.related('outlet').isNew() || outlet_id != user.related('outlet').get('id'))) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        return OAuthClient
            .generateID(trx)
            .then(client_id =>
                new OAuthClient({
                    client_id,
                    client_secret: OAuthClient.generateSecret(),
                    api_version_id,
                    family_id,
                    role_id,
                    tag,
                    redirect_uri,
                    outlet_id
                })
                .save(null, { transacting: trx })
            )
            .then(model => // Fetch the model to load entire row and its relations
                OAuthClient
                    .forge({ id: model.get('id') })
                    .fetch({
                        withRelated: ['api_version', 'role'],
                        transacting: trx
                    })
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Used to clear all access tokens associated with a given client
     * 
     * @param {bookshelf.Model} client_model
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise<bookshelf.Model>}
     */
    clear(client_model, { user, trx } = {}) {
        if (
            !user.can('admin', 'delete', 'access-token')
            && (
                !client_model.has('outlet_id')
                || user.related('outlet').get('id') !== client_model.get('outlet_id')
            )
        ) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        return AccessTokenModel
            .where('client_id', client_model.get('id'))
            .destroy({ transacting: trx })
            .then(() => client_model)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Delete an OAuth2 client
     * 
     * @param {bookshelf.Model} user_model user deleting the client
     * @param {string} client_id client to delete
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    delete(client_id, { user, trx } = {}) {
        let query = { id: client_id };

        if (!user.can('admin', 'delete', 'client')) {
            if (user.related('outlet').isNew()) {
                return Promise.reject(ferror(ferror.FORBIDDEN));
            } else {
                query.outlet_id = user.related('outlet').get('id');
            }
        }

        return OAuthClient
            .where(query)
            .destroy({
                require: true,
                transacting: trx
            })
            .catch(OAuthClient.NoRowsDeletedError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Client with ID does not exist')
                )
            )
            .catch(err =>
                Promise.reject(
                    ferror.constraint(err)
                )
            )
    }

    /**
     * Delete the given client family
     * 
     * @param {number} family_id
     * @param {object} context
     * @param {UserModel} context.user
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {({ result: 'ok' })}
     */
    deleteFamily(family_id, { user, trx } = {}) {
        let query = { id: family_id };

        if (!user || !user.can('admin', 'delete', 'client-family')) {
            if (!user.has('outlet_id')) {
                return Promise.reject(ferror(ferror.FORBIDDEN));
            }

            query.outlet_id = user.get('outlet_id');
        }
        
        return ClientFamilyModel
            .where(query)
            .destroy({ require: true, transacting: trx })
            .catch(ClientFamilyModel.NoRowsDeletedError, () =>
                Promise.reject(ferror(ferror.FORBIDDEN))
            )
            .then(() => Promise.resolve({ result: 'ok' })) // TODO replace { result: 'ok' } with { success: true }?
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Get the OAuth2 Client authorization info for the user trying to authorize
     * access to the given client.
     * 
     * @param {number} id id of client
     * @param {object} context
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<object>}
     */
    getAuthorizationInfo({ client_model, client_id } = {}, { trx } = {}) {
        return (
                (client_model == null)
                    ? OAuthClient.forge({ client_id }).fetch({ require: true, transacting: trx })
                    : Promise.resolve(client_model)
            )
            .then(client_model =>
                Promise.all([
                    (client_model.has('outlet_id'))
                        ? client_model.outlet().fetch({ transacting: trx })
                        : Promise.resolve(null)
                ])
            )
            .then(([outlet] = []) => {
                if (outlet) outlet.columns(OutletModel.FILTERS.PREVIEW)
                return Promise.resolve({ outlet })
            })
            .catch(OAuthClient.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid client'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    /**
     * Fetches the oauth2 client by its client id
     * 
     * @param {string} client_id client id of the oauth2 client to fetch
     * @param {object} context
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<ClientModel>}
     */
    getByClientID(client_id, { trx } = {}) {
        return OAuthClient
            .where({ client_id })
            .fetch({
                require: true,
                transacting: trx
            })
            .catch(OAuthClient.NotFoundError, () =>
                Promise.reject(ferror(ferror.INVALID_REQUEST).msg('Invalid client id'))
            )
            .catch(err => Promise.reject(ferror.constraint(err)))
    }

    /**
     * Fetch an oauth2 client by its id, optionally 
     * returning the secret if specified
     * 
     * @param {string} client_id
     * @param {Bool} show_secret Determines to fetch secret or not
     * @param {object} [options]
     * @param {boolean} [options.show_secret] Determines to fetch secret or not
     * @param {boolean} [options.require=false]
     * @param {knex.Transaction} [options.trx]
     * 
     * @returns {Promise<bookshelf.Model>}
     */
    getById(id, { show_secret, require = true, trx, user } = {}) {
        return OAuthClient
            .where({ id })
            .fetch({
                require,
                columns: show_secret ? OAuthClient.FILTERS.SAFE.including('client_secret') : OAuthClient.FILTERS.SAFE,
                transacting: trx
            })
            .then(client => {
                const ownsClient = (client.get('outlet_id') !== null && client.get('outlet_id') === user.related('outlet').get('id'));

                //Check if the user is not an admin and their outlet doesn't own this client
                if(!user.can('admin', 'get', 'client') && !ownsClient) {
                    return Promise.reject(ferror(ferror.FORBIDDEN))
                }

                return Promise.resolve(client);
            })
            .catch(OAuthClient.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Client not found with ID ' + id)
                )
            )
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Get a list of all tokens for the user's outlet
     * 
     * @param {bookshelf.Model} user_model user whose outlet clients to fetch
     * @param {knex.Transaction} [trx]
     * 
     * @returns {Promise}
     */
    list({ outlet_id = null } = {}, { user, trx } = {}) {
        if (
            !user.can('admin', 'get', 'client')
            && (user.related('outlet').isNew() || outlet_id != user.related('outlet').get('id'))
        ) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }

        return OAuthClient
            .where('outlet_id', outlet_id)
            .fetchAll({
                withRelated: ['api_version', 'role'],
                transacting: trx
            })
            .then(collection => collection.models)
            .catch(err =>
                Promise.reject(ferror.constraint(err))
            );
    }

    /**
     * Lists the client families under the given outlet id
     * 
     * @param {number} [outlet_id=null]
     * @param {object} context
     * @param {UserModel} context.user
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<ClientFamilyMember>}
     */
    listFamilies(outlet_id = null, { user, trx } = {}) {
        let is_admin = (user && user.can('admin', 'get', 'client-family'));
        if (!is_admin && (!outlet_id || outlet_id != user.get('outlet_id'))) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }
        
        return ClientFamilyModel
            .where({ outlet_id })
            .fetchAll({ transacting: trx })
            .then(collection => collection.models)
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Creates a new client family
     * 
     * @param {object} options
     * @param {number} [options.outlet_id] only admins can ignore outlet_id, this will create a generic, outlet-less family
     * @param {string} [options.tag] tag for this family
     * @param {object} context
     * @param {UserModel} context.user
     * @param {knex.Transaction} [context.trx]
     * 
     * @returns {Promise<ClientFamilyMember>}
     */
    makeFamily({ outlet_id, tag } = {}, { user, trx } = {}) {
        let is_admin = (user && user.can('admin', 'create', 'client-family'));
        if (!is_admin && (!outlet_id || outlet_id != user.get('outlet_id'))) {
            return Promise.reject(ferror(ferror.FORBIDDEN));
        }
        
        return new ClientFamilyModel({ outlet_id, tag })
            .save(null, { method: 'insert', transacting: trx })
            .catch(err => Promise.reject(ferror.constraint(err)));
    }

    /**
     * Update an existing OAuth2 client
     * NOTE: Updating client role will destroy all related access tokens!
     * NOTE: Disabling an oauth client will destroy all related access tokens!
     * 
     * 
     * @returns {Promise<bookshlef.Model>}
     */
    update(client_id, { api_version_id, family_id, scope, enabled, tag, redirect_uri, rekey } = {}, { user, trx } = {}) {
        let query = { id: client_id };
        let updates = { };

        if (!user.can('admin', 'update', 'client')) {
            if (user.related('outlet').isNew()) {
                return Promise.reject(ferror(ferror.FORBIDDEN));
            } else {
                query.outlet_id = user.related('outlet').get('id');
            }
        }

        if (api_version_id != null) updates.api_version_id = api_version_id;
        if (tag !== undefined) updates.tag = tag;
        if (family_id !== undefined) updates.family_id = family_id;
        if (enabled != null) updates.enabled = enabled;
        if (redirect_uri !== undefined) updates.redirect_uri = redirect_uri;
        if (rekey) {
            updates.client_secret = OAuthClient.generateSecret();
        }
        return (
                (_.isString(scope))
                    ? RoleController.getOne({ entity: 'client', tag: scope }, { trx })
                    : Promise.resolve()
            )
            .then(role_model => {
                if (!role_model) {
                    if (scope) return Promise.reject(
                        ferror(ferror.INVALID_REQUEST)
                            .msg('Invalid scope')
                            .param('scope')
                            .value(scope)
                    );
                } else {
                    return updates.role_id = role_model.get('id');
                }
            })
            .then(() =>
                OAuthClient
                    .where(query)
                    .fetch({
                        require: true,
                        transacting: trx
                    })
            )
            .then(client_model => {
                let clear_tokens = client_model.get('enabled') === true && enabled === false;
                return client_model
                    .save(updates, { patch: true, transacting: trx })
                    .then(() =>
                        (clear_tokens)
                            ? this.clear(client_model, { user, trx })
                            : Promise.resolve()
                    )
                    .then(() => client_model)
                    // TODO why does this break?
                    // .then(() =>
                    //     client_model.load(['api_version', 'role'])
                    // )
            })
            .catch(OAuthClient.NotFoundError, () =>
                Promise.reject(
                    ferror(ferror.NOT_FOUND)
                        .msg('Client with this ID does not exist')
                )
            )
            .catch(err =>
                Promise.reject(
                    ferror.constraint(err)
                )
            )
    }
}

module.exports = new OAuthClientController;

const AccessTokenController = require('./AccessToken');
const ApiVersionController = require('../ApiVersion');
const RoleController = require('./Role');