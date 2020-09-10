'use strict';

const _ = require('lodash');
const AccessTokenModel = require('../models/oauth_access_token');
const auth = require('../lib/auth');
const AuthController = require('../controllers/Auth');
const ferror = require('../lib/frescoerror');
const oauth2orize = require('oauth2orize');
const passport = require('passport');
const UserController = require('../controllers/User');

const server = oauth2orize.createServer();

server.serializeClient((client, cb) => {
    cb(null, client.get('client_id'));
});
server.deserializeClient((client_id, cb) => {
    ClientModel
        .where({ client_id })
        .fetch()
        .then(model => cb(null, model))
        .catch(ferror.constraint(cb));
});

// NOTE authorization code grant type for oauth2orize needed to be implemented manually
// see /v2/auth/authorize

// OAuth2 exchanging grant authorization code for access token
server.exchange(oauth2orize.exchange.code(function(client, code, redirect_uri, cb) {
    // If the client was passed via access token, disallow
    if (client.related('client')) {
        return cb(ferror(ferror.FORBIDDEN));
    }

    AuthController.AuthorizationCode
        .exchange(code, { client })
        .then(token_model =>
            AuthController.AccessToken
                .build(token_model, {
                    show_client: true,
                    show_role: true
                })
        )
        .then(token_model => {
            token_model.set('expires_in', token_model.get('expires_at').getTime() - Date.now());
            cb(null, token_model);
        })
        .catch(cb);
}));

// OAuth2 trusted first parties (us) ONLY! Allows client to handle/send up the user's credentials
// in order to get an access token
server.exchange(oauth2orize.exchange.password(function(client, username, password, scope, cb) {
    // If the client was passed via access token, disallow
    if (client.related('client')) {
        return cb(ferror(ferror.FORBIDDEN));
    }

    scope = scope || ["read"];

    let scope_err = ferror(ferror.INVALID_REQUEST)
        .msg('Invalid scope provided. Expected: "read", "write"')
        .param('scope')
        .value(scope.join(' '));

    if (scope.length !== 1) {
        return cb(scope_err);
    } else {
        scope = scope[0];
    }

    UserController
        .login(username, password)
        .then(user_model => {
            if (!user_model) return Promise.reject(
                ferror(ferror.UNAUTHORIZED)
                    .param(['username', 'password'])
                    .msg('Invalid credentials')
            );

            AuthController.Role
                .getOne({ entity: 'token', tag: scope })
                .then(role_model =>
                    (role_model == null)
                        ? Promise.reject(scope_err)
                        : AuthController.AccessToken.generate(client, role_model.get('id'), user_model.get('id'))
                )
                .then(token_model =>
                    AuthController.AccessToken
                        .build(token_model, {
                            show_client: true,
                            show_role: true
                        })
                )
                .then(token_model => {
                    token_model.set('expires_in', token_model.get('expires_at').getTime() - Date.now());
                    cb(null, token_model);
                })
                .catch(cb);
        })
        .catch(cb);
}));

// OAuth2 exchange client credentials for an access token on behalf of the client
// TODO is this necessary?
server.exchange(oauth2orize.exchange.clientCredentials(function(client, scope, cb) {
    // If the client was passed via access token, disallow
    if (client.related('client')) {
        return cb(ferror(ferror.FORBIDDEN));
    }

    scope = scope || ["read"];
    let scope_err = ferror(ferror.INVALID_REQUEST)
        .msg('Invalid scope provided. Expected: "read", "write"')
        .param('scope')
        .value(scope.join(' '));

    if (scope.length !== 1) {
        return cb(scope_err);
    } else {
        scope = scope[0];
    }

    AuthController.Role
        .getOne({ entity: 'token', tag: scope })
        .then(role_model =>
            (role_model == null)
                ? Promise.reject(scope_err)
                : AuthController.AccessToken.generate(client, role_model.get('id'))
        )
        .then(token_model =>
            AuthController.AccessToken
                .build(token_model, {
                    show_client: true,
                    show_role: true
                })
        )
        .then(token_model => {
            token_model.set('expires_in', token_model.get('expires_at').getTime() - Date.now());
            cb(null, token_model);
        })
        .catch(cb);
}));

// OAuth2 exchange for refreshing an expired access token
server.exchange(oauth2orize.exchange.refreshToken(function(client, refresh_token, cb) {
    // If the client was passed via access token, disallow
    if (client.related('client')) {
        return cb(ferror(ferror.FORBIDDEN));
    }

    AuthController.AccessToken
        .refresh(refresh_token)
        .then(token_model => {
            if (!token_model) {
                return Promise.reject(
                    ferror(ferror.UNAUTHORIZED)
                        .msg('Invalid refresh token')
                        .param('refresh_token')
                );
            } else {
                token_model.set('expires_in', token_model.get('expires_at').getTime() - Date.now());
                return token_model;
            }
        })
        .then(token_model =>
            AuthController.AccessToken
                .build(token_model, {
                    keep_fields: ['expires_in'],
                    show_client: true,
                    show_role: true
                })
        )
        .then(token_model => cb(null, token_model))
        .catch(cb);
}));

// Endpoint for exchanging auth codes for access tokens
module.exports.token = [
    (req, res, next) => { // Check the grant type, oauth2orize 500's otherwise
        switch (req.body.grant_type) {
            case 'client_credentials':
            case 'password':
            case 'refresh_token':
            case 'authorization_code':
                return next();
            default:
                return next(
                    ferror(ferror.INVALID_REQUEST)
                        .param('grant_type')
                        .value(req.body.grant_type || null)
                        .msg('Invalid grant type, expected: "client_credentials", "password", "refresh_token", or "authorization_code"')
                );
        }
    },
    server.token(),
    (err, req, res, next) => {
        if (ferror.isFresco(err)) {
            next(err);
        } else if (err.status === 403) {
            next(ferror(ferror.UNAUTHORIZED));
        } else if (err.status === 400) {
            next(ferror(ferror.INVALID_REQUEST).msg(err.message));
        } else {
            next(ferror(err).type(ferror.API).msg('Something went wrong, please wait a few minutes and try again. If you continue to see this, please contact us at info@fresconews.com'));
        }
    }
];

passport.use(auth.strategies.basic);
passport.use(auth.strategies.bearer);
module.exports.passport = [
    (req, res, next) => {
        if (req.query['auth_client']) {
            req.headers['authorization'] = `Basic ${req.query['auth_client']}`;
            delete req.query['auth_client'];
        }
        next();
    },
    passport.initialize(),
    passport.authenticate(['basic', 'bearer'], { session: false }),
    (req, res, next) => { // Place the resolved models in res.locals
        let is_expired = false;
        if (req.user.objectName === 'access_token') {
            res.locals.access_token = req.user;

            res.locals.user = req.user.related('user').isNew() ? undefined : req.user.related('user');
            res.locals.client = req.user.related('client');
            res.locals.version = res.locals.client.related('api_version').versionString();
            res.locals.outlet = res.locals.client.has('outlet_id')
                                    ? res.locals.client.related('outlet')
                                    : null;

            is_expired = res.locals.access_token.isExpired();
        } else if (req.user.objectName === 'client') {
            res.locals.client = req.user;
            res.locals.version = res.locals.client.related('api_version').versionString();
            res.locals.outlet = res.locals.client.has('outlet_id')
                                    ? res.locals.client.related('outlet')
                                    : null;
        }

        if (!res.locals.client.related('api_version').get('is_enabled')) {
            return next(ferror(ferror.UNAUTHORIZED).msg('The client associated with this request is disabled. It can be reenabled from the Fresco outlet settings page.'));
        }
        let _deprecated_at = res.locals.client.related('api_version').get('deprecated_at');
        if (_deprecated_at && _deprecated_at.getTime() < Date.now()) {
            return next(ferror(ferror.UNAUTHORIZED).msg("This client uses a deprecated version of the Fresco API. Please update your client's API version from the Fresco outlet settings page."));
        }

        // Check that the client is enabled and that the bearer, if provided, is not expired
        if (res.locals.client.get('enabled') && !is_expired) {
            // Update the last used time for this client
            res.locals.client
                .save({ last_used_at: new Date() }, { patch: true })
                .then(() => next())
                .catch(ferror.constraint(next));
        } else if (is_expired) {
            next(ferror(ferror.UNAUTHORIZED).msg('Token has expired').code('token-expired'));
        } else {
            next(ferror(ferror.UNAUTHORIZED));
        }
    }
];

/**
 * Checks if the authentication token used has all listed permissions
 * 
 * @param {object|object[]} scopes When an array is passed, at least 1 condition must be satisfied
 * @param {(string|string[])} scopes.client scopes that must be present on the client
 * @param {(string|string[])} scopes.token scopes that must be present on the access token
 * @param {(string|string[])} scopes.user scopes that must be present on the user
 */
module.exports.permissions = (scopes = []) => (req, res, next) => {
    if (!Array.isArray(scopes)) scopes = [scopes];
    if (scopes.some(s => processPermissions(res, s))) {
        return next();
    } else {
        return next(ferror(ferror.FORBIDDEN));
    }
};

/**
 * Function used by exports#permissions to test permission scopes
 * NOTE: If booleans are passed, the respective local variable must be
 * either set for `true` or unset for `false`.  (For example, if a route
 * can be hit only by clients and not barers, one would say scopes.token = false
 * and define the required permissions of the client on scopes.client)
 * 
 * @param {express.Response} res
 * @param {object} scopes
 * @param {(string|string[]|boolean)} scopes.client
 * @param {(string|string[]|boolean)} scopes.user
 * @param {boolean} scopes.requireBearer if true, forces Bearer authentication
 * 
 * @returns {boolean}
 */
function processPermissions(res, { client = false, user = false, requireBearer = false } = {}) {
    if (requireBearer && !res.locals.access_token) {
        return false;
    }

    if (client && !Array.isArray(client)) client = [client];
    if (user && !Array.isArray(user)) user = [user];

    let token_scopes = [];

    if (res.locals.user) {
        if (!user || !auth.checkPermissions(user, auth.scopesToRegex(res.locals.user.scopes()))) {
            return false;
        } else {
            token_scopes = user;
        }
    } else if (res.locals.client) {
        if (!client || !auth.checkPermissions(client, auth.scopesToRegex(res.locals.client.related('role').get('scopes')))) {
            return false;
        } else {
            token_scopes = client;
        }
    } else {
        // Deny all other unpermitted access
        return false;
    }

    if (res.locals.access_token) { // If an access token was used, check its scopes as well
        return auth.checkPermissions(token_scopes, auth.scopesToRegex(res.locals.access_token.related('role').get('scopes')))
    } else {
        return true;
    }
}