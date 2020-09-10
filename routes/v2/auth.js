'use strict';


const express = require('express');

const ferror = require('../../lib/frescoerror');
const needs = require('../../lib/needs');

const AuthController = require('../../controllers/Auth');
const UserController = require('../../controllers/User');

const User = require('../../models/user');

const middleware = require('../../middleware');

const router = express.Router();

/**
 * Base Route
 * /v2/auth/
 */

router.get('/authorize',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:client:get'
    }),
    needs.querystring({
        client_id: 'str'
    }),
    (req, res, next) => {
        AuthController.Client
            .getAuthorizationInfo(req.query, res.locals)
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/authorize',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:auth:create',
        client: 'client:auth:create'
    }),
    needs.body({
        client_id: 'str',
        redirect_uri: 'str',
        scope: ['read', 'write'],
        state_: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        Promise
            .all([
                AuthController.Role.getOne({ entity: 'token', tag: req.body.scope }, res.locals),
                AuthController.Client.getByClientID(req.body.client_id, res.locals)
            ])
            .then(([role, client] = []) =>
                AuthController.AuthorizationCode
                    .generate(Object.assign({ client, role }, req.body), res.locals)
            )
            .then(auth_code_model =>
                AuthController.AuthorizationCode
                    .build(auth_code_model, Object.assign({ show_role: true }, res.locals))
            )
            .then(res.send.bind(res))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

router.post('/token',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:create'
    }),
    middleware.auth.token
);

router.delete('/token',
    middleware.hashIds,
    (req, res, next) => {
        if (res.locals.access_token) {
            res.locals.access_token
                .destroy()
                .then(() => res.send({ result: 'ok' }))
                .catch(ferror.constraint(next));
        } else {
            next(ferror(ferror.FORBIDDEN).msg('Invalid authentication, requires an access token'));
        }
    }
);

router.get('/token/me',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:auth:get', 'user:auth:get']],
        client: 'client:auth:get',
        requireBearer: true
    }),
    (req, res, next) => {
        AuthController.AccessToken
            .build(res.locals.access_token, Object.assign({
                show_client: true,
                show_role: true
            }, res.locals))
            .then(res.send.bind(res))
            .catch(next);
    }
);

// TODO: deprecate the `token` param
router.post('/token/migrate',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:update'
    }),
    needs.body({
        // refresh_token: 'str',
        refresh_token_: 'str',
        token_: 'str' // TEMP
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let __tmp = Promise.resolve(req.body.refresh_token);
        if (req.body.token) {
            __tmp = AuthController.AccessToken.model
                        .where({ token: req.body.token })
                        .fetch({ require: true, transacting: res.locals.trx })
                        .then(m => m.get('refresh_token'))
                        .catch(AuthController.AccessToken.model.NotFoundError, () => Promise.reject(ferror(ferror.FORBIDDEN)));
        }

        __tmp
            .then(refresh_token =>
                AuthController.AccessToken.refresh(refresh_token, res.locals.trx)
            )
            .then(token_model =>
                AuthController.AccessToken.migrateClient(token_model, res.locals)
            )
            .then(token_model =>
                AuthController.AccessToken
                    .build(token_model, Object.assign({
                        show_client: true,
                        show_role: true
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .then(res.locals.trx.commit)
            .catch(next);
        
        // TODO: Use this
        // AuthController.AccessToken
        //     .refresh(req.body.refresh_token, res.locals.trx)
        //     .then(token_model =>
        //         AuthController.AccessToken.migrateClient(token_model, res.locals)
        //     )
        //     .then(token_model =>
        //         AuthController.AccessToken
        //             .build(token_model, Object.assign({
        //                 show_client: true,
        //                 show_role: true
        //             }, res.locals))
        //     )
        //     .then(res.send.bind(res))
        //     .catch(next);
    }
);

router.post('/signin',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:create'
    }),
    needs.body({
        username: 'str',
        password: 'str',
        installation_: { // Used for push notifications + linking devices to users
            device_id_:          'str', // DEPRECATED
            app_version:        'str',
            platform:           ['ios', 'android'],
            device_token_:       'str',
            old_device_token_:  'str',
            timezone_:          'str', // TODO What type??
            locale_identifier_: 'str'
        }
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;

        AuthController
            .signin({
                username: req.body.username,
                password: req.body.password,
                installation: req.body.installation,
                client: res.locals.client
            }, trx)
            .then(result =>
                UserController
                    .build(null, result.user, {
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true,
                        trx
                    })
                    .then(() => Promise.resolve(result)) // Return original result
            )
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/checkSocial',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:create'
    }),
    needs.body({
        token_: 'str', // facebook, twitter
        platform: ['facebook', 'twitter', 'google'],
        secret_: 'str', // twitter only
        jwt_: 'str' // google only
    }),
    (req, res, next) => {
        AuthController
            .checkSocial({
                client: res.locals.client,
                token: req.body.token,
                secret: req.body.secret,
                jwt: req.body.jwt,
                platform: req.body.platform
            })
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/signin/social',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:create'
    }),
    needs.body({
        token_: 'str', // facebook, twitter
        platform: ['facebook', 'twitter', 'google'],
        secret_: 'str', // twitter only
        jwt_: 'str', // google only
        installation_: { // Used for push notifications + linking devices to users
            device_id_:          'str', // DEPRECATED
            app_version:        'str',
            platform:           ['ios', 'android'],
            device_token_:       'str',
            old_device_token_:  'str',
            timezone_:          'str', // TODO What type??
            locale_identifier_: 'str'
        }
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        AuthController
            .socialSignin({
                client: res.locals.client,
                token: req.body.token,
                secret: req.body.secret,
                jwt: req.body.jwt,
                platform: req.body.platform,
                installation: req.body.installation
            }, trx)
            .then(result => 
                UserController
                    .build(null, result.user, { 
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true,
                        trx
                    })
                    .then(() => Promise.resolve(result)) // Return original result
            )
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/signout',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:token:delete'
    }),
    needs.body({
        installation_id_: 'int'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        // TODO temporary
        if (!req.body.installation_id) {
            return res.send({ result: 'ok' })
        }

        let trx = res.locals.trx;
        UserController.Installation
            .disassociate(res.body.installation_id, trx)
            .then(res.send.bind(res))
            .then(trx.commit)
            .catch(next);
    }
)

// TODO DEPRECATED
router.post('/register',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:auth:create' // Left out client:user:create to allow public clients to register users
    }),
    needs.body({
        email:              'str', // User's email
        username:           'str', // User's username (no @ at beginning)
        password:           'str', // User's plaintext password
        full_name_:         'str', // User's full name
        bio_:               'str', // User's profile bio
        location_:          'str', // User's profile location string
        radius_:            needs.miles_to_meters,
        phone_:             'str', // User's phone number (include country code)
        avatar_:            'str', // User's avatar URL
        twitter_handle_:    'str', // User's twitter handle
        settings_: { // Users settings
            notification_radius_: 'float'
        },
        social_links_: { // Info for linking social media accounts
            facebook_: {
                token: 'str'
            },
            twitter_: {
                token:  'str',
                secret: 'str'
            }
        },
        installation_: { // Used for push notifications + linking devices to users
            device_id_:          'str', // DEPRECATED
            app_version:        'str10',
            platform:           ['ios', 'android'],
            device_token_:       'str',
            old_device_token_:  'str',
            timezone_:          'str', // TODO What type??
            locale_identifier_: 'str'
        },
        outlet_: { // Used to create outlet
            token_: 'str', // If valid token is passed, will add user to outlet.
            title_: 'str24',
            link_:  'str255',
            type_: 'str',
            state_: 'str',
            source_: 'str',
        },
        dob_: {
            day:    'str',
            month:  'str',
            year:   'str'
        },
        address_: {
            line1_:         'str',
            line2_:         'str',
            city_:          'str',
            state_:         'str',
            postal_code_:   'str',
            country_:       'str'
        },
        currency_:          'str', // User's currency code (default usd)
        stripe_token_:      'str', // Stripe single-use token for user's card or bank account
        account_type_:      ['individual', 'corporation'], // Stripe entity type
        tax_id_:            'str', // For corporations, used by Stripe
        vat_id_:            'str', // For companies in the EU, used by Stripe
        pid_token_:         'str', // Stripe.JS personal ID # token
        ssn_last4_:         'str',
        document_token_:    'str' // Stripe.JS uploaded verification file token
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;

        req.body.ip_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // Used for recording Stripe ToS agreement
        req.body.oauth_client = res.locals.client;

        AuthController
            .register(req.body, trx)
            .then(result => 
                UserController
                    .build(null, result.user, { 
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true,
                        trx
                    })
                    .then(() => Promise.resolve(result)) // Return original result
            )
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

/**
 * Sets new password reset token
 */
router.post('/reset',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:user:update'
    }),
    needs.body({
        token: 'str',
        password: 'str'
    }),
    (req, res, next) => {
        AuthController
            .updatePassword(req.body.token, req.body.password)
            .then(u =>
                UserController
                    .build(null, u, { 
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

/**
 * Sets new password reset token
 */
router.post('/reset/request',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:password-reset-token:create'
    }),
    needs.body({ username: 'str' }),
    (req, res, next) => {
        AuthController
            .requestPasswordReset(req.body.username)
            .then(r => res.send(r))
            .catch(next);
    }
);


/**
 * Retrieves user details for reset token
 */
router.get('/reset/:token',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:password-reset-token:get'
    }),
    needs.spat({ token: 'str' }),
    (req, res, next) => {
        AuthController
            .getPasswordResetUser(req.params.token)
            .then(u =>
                UserController
                    .build(null, u, { 
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

module.exports = router;