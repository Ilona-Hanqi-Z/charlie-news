'use strict';

const bcrypt = require('bcryptjs');
const express = require('express');
const Promise = require('bluebird');

const middleware = require('../../middleware');

const hashids = require('../../lib/hashids');
const ferror = require('../../lib/frescoerror');
const needs = require('../../lib/needs'); 
const upload = require('../../lib/multer');

const NotificationController = require('../../controllers/Notification');
const PostController = require('../../controllers/Post');
const ReportController = require('../../controllers/Report');
const SocialController = require('../../controllers/Social');
const StripeController = require('../../controllers/Stripe');
const UserController = require('../../controllers/User');
const TermsController = require('../../controllers/Terms');

const User = require('../../models/user');

const router = express.Router();

const username_spat = needs.spat({
    username_: needs.id_or_str
});

/**
 * Base Route
 * /v2/user/
 */
router.get('/me',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:get'
    }),
    needs.no.querystring,
    (req, res, next) => {
        UserController
            .build(res.locals.user, res.locals.user, {
                show_outlet: true,
                show_social_links: true,
                show_roles: true,
                show_social_stats: true,
                show_submission_stats: true,
                show_terms: true,
                show_identity: true
            })
            .then(result => res.send(result))
            .catch(next);
    }
);

router.post('/create',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:user:create'
    }),
    needs.body({
        email:              'str254', // User's email
        username:           'str32', // User's username (no @ at beginning)
        password:           'str', // User's plaintext password
        full_name_:         'str40', // User's full name
        bio_:               'str', // User's profile bio
        location_:          'str40', // User's profile location string
        radius_:            needs.miles_to_meters,
        phone_:             'str15', // User's phone number (include country code)
        avatar_:            'str255', // User's avatar URL
        twitter_handle_:    'str20', // User's twitter handle
        social_links_: { // Info for linking social media accounts
            facebook_: {
                token: 'str'
            },
            google_: {
                jwt: 'str'
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
        tax_id_:            'str', // For corporations, used by Stripe
        vat_id_:            'str', // For companies in the EU, used by Stripe
        pid_token_:         'str', // Stripe.JS personal ID # token
        ssn_last4_:         'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        req.body.ip_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // Used for recording Stripe ToS agreement
 
        UserController
            .create(req.body, res.locals)
            .then(result =>
                UserController
                    .build(null, result, { 
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true,
                        trx: res.locals.trx
                    })
            )
            .then(res.send.bind(res))
            .then(res.locals.trx.commit)
            .catch(next);
    }
);

router.get('/check',
    middleware.auth.permissions({
        user: 'user:user:get',
        client: 'client:user:get'
    }),
    needs.querystring({
        username_: 'str',
        email_: 'str'
    }),
    (req, res, next) => {
        UserController
            .check(req.query)
            .then((unavailable = []) =>
                res.send({
                    available: unavailable.length === 0,
                    fields_unavailable: unavailable
                })
            )
            .catch(next);
    }
);

router.post('/avatar',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:update'
    }),
    needs.no.body,
    upload.single('avatar'),
    (req, res, next) => {
        UserController
            .updateAvatar(res.locals.user, req.file)
            .then(u => 
                UserController
                    .build(res.locals.user, u, {
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/identity/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:update'
    }),
    needs.body({
        first_name_: 'str64',
        last_name_: 'str64',
        dob_day_: 'int',
        dob_month_: 'int',
        dob_year_: 'int',
        address_line1_: 'str64',
        address_line2_: 'str64',
        address_zip_: 'str5',
        address_city_: 'str40',
        address_state_: 'str2',
        pid_last4_: 'str4',
        stripe_pid_token_: 'str',
        stripe_document_token_: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        UserController.Identity
            .update(res.locals.user, req.body, trx)
            .then(() =>
                UserController.build(res.locals.user, res.locals.user, { 
                    show_outlet: true,
                    show_social_links: true,
                    show_roles: true,
                    show_social_stats: true,
                    show_submission_stats: true,
                    show_terms: true,
                    show_identity: true,
                    trx
                })
            )
            .then(u => res.send(u))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/disable',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:user:update', 'user:user:update']]
    }),
    needs.body({
        'user_id_': 'int',
        'username_': 'str',
        'email_': 'str',
        'password_': 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .disable(res.locals.user, req.body, trx)
            .then(r => res.send({ success: 'ok' }))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/social/connect',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:update'
    }),
    needs.body({
        platform: ['facebook', 'twitter', 'google'],
        token_: 'str',
        secret_: 'str',
        jwt_: 'str'
    }),
    (req, res, next) => {
        SocialController
            .connect(req.body, res.locals)
            .then(u =>
                UserController
                    .build(res.locals.user, res.locals.user, {
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/social/disconnect',
    middleware.hashIds,
    middleware.auth.permissions({
        token: 'token:user:update',
        user: 'user:user:update'
    }),
    needs.body({
        platform: ['facebook', 'twitter', 'google']
    }),
    (req, res, next) => {
        SocialController
            .disconnect(req.body, res.locals)
            .then(u =>
                UserController
                    .build(res.locals.user, res.locals.user, {
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/locate',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-location:update'
    }),
    needs.body({
        lng: 'float',
        lat: 'float'
    }),
    (req, res, next) => {
        UserController.Location
            .update(res.locals.user, req.body)
            .then(r => res.send(r))
            .catch(next)
    }
);

router.get('/locations/find',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:user-location:get'
    }),
    needs.querystring({
        geo_: needs.geoJSON,
        radius_: needs.miles_to_meters,
        where_: [ 'contained', 'contains', 'interesects'],
        assignment_id_: 'int'
    }),
    (req, res, next) => {
        UserController.Location
            .find(req.query)
            // .then(u => UserController.build(res.locals.user, u))
            .then(r => res.send(r))
            .catch(next);
});

router.post('/locations/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-location-report:create'
    }),
    needs.body({
        geo_: needs.geoJSON,
        radius_: needs.miles_to_meters,
        since_: 'datetime',
        where_: [ 'contained', 'contains', 'interesects']
    }),
    (req, res, next) => {
        UserController.Location
            .report(req.body)
            .then(r => res.send(r))
            .catch(next);
});

router.post('/payment/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-payment:create'
    }),
    needs.body({
        token: 'str',
        active_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        req.body.ip_address = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        UserController.Payment
            .createMethod(res.locals.user, req.body, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next)
    }
);

router.get('/payment/:ids?',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-payment:get'
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        UserController.Payment
            .listMethods(res.locals.user, req.params.ids)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/payment/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-payment:delete'
    }),
    needs.no.body,
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController.Payment
            .removeMethod(res.locals.user, req.params.id, trx)
            .then(result => {
                trx.commit();
                res.send(result);
            })
            .catch(next)
    }
);

router.post('/payment/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-payment:update'
    }),
    needs.spat_id,
    needs.body({
        active_: 'bool',
        address_city_: 'str',
        address_state_: 'str',
        address_zip_: 'str',
        address_country_: 'str',
        address_line1_: 'str',
        address_line2_: 'str',
        exp_month_: 'int',
        exp_year_: 'int',
        name_: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController.Payment
            .updateMethod(res.locals.user, req.params.id, req.body, trx)
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/notifications',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:notification:get'
    }),
    needs.pagination,
    (req, res, next) => {
        NotificationController.Mediums.Fresco
            .feed(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/notifications/see',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:notification:update'
    }),
    needs.body({
        notification_ids: 'int[]'
    }),
    (req, res, next) => {
        NotificationController.Mediums.Fresco
            .see(res.locals.user, req.body.notification_ids)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/settings',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:settings:get'
    }),
    needs.querystring({
        types_like_: 'str',
        types_: 'str[]'
    }),
    (req, res, next) => {
        UserController.Settings
            .getByUser(res.locals.user, req.query)
            .then(u => res.send(u))
            .catch(next);
    }
);

router.post('/settings/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:settings:update'
    }),
    needs.body({
        'notify-user-social-repost-liked_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-social-reposted_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-social-mentioned-comment_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-social-gallery-liked_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-social-followed_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-social-commented_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-promo-recruit-fulfilled_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-promo-first-assignment_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-promo-code-entered_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-tax-info-required_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-tax-info-processed_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-tax-info-declined_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-payment-sent_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-payment-expiring_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-payment-payment-declined_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-news-today-in-news_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-news-story_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-news-photos-of-day_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-news-gallery_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-news-custom-push_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-dispatch-purchased_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-dispatch-new-assignment_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-dispatch-content-verified_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-user-dispatch-assignment-expired_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-payment-invalid_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-new-purchase_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-recommended-content_': {
            send_email_: 'bool'
        },
        'notify-outlet-inactive_': {
            send_email_: 'bool'
        },
        'notify-outlet-invite-pending_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-invite-accepted_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-rejected_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-pending_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-expired_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-content_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-approved_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
        'notify-outlet-assignment-accepted_': {
            send_push_: 'bool',
            send_fresco_: 'bool',
            send_email_: 'bool',
            send_sms_: 'bool'
        },
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController.Settings
            .saveSettings(res.locals.user, req.body, trx)
            .then(u => res.send(u))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/suggestions',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:get',
        client: 'client:user:get'
    }),
    needs.querystring({
        limit_: 'int'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .suggest(res.locals.user, req.query, trx)
            .then(u => UserController.build(res.locals.user, u, {
                filter: User.FILTERS.PUBLIC,
                show_social_stats: true,
                show_submission_stats: true
            }))
            .then(res.send.bind(res))
            .then(trx.commit)
            .catch(next);
    }
)

router.get('/blocked',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:get'
    }),
    needs.pagination,
    (req, res, next) => {
        UserController
            .blocked(res.locals.user, req.query)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        filter: User.FILTERS.PUBLIC,
                        show_social_stats: true,
                        show_submission_stats: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/suspended',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user:get'
    }),
    needs.pagination,
    (req, res, next) => {
        UserController
            .suspended(res.locals.user, req.query)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        filter: User.FILTERS.PUBLIC,
                        show_report_stats: true,
                        show_social_stats: true,
                        show_submission_stats: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

router.post('/report/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-report:delete'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .unreport(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/reported',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-report:get'
    }),
    needs.querystring({
        reasons_: 'str[]'
    }).including(needs.pagination),
    (req, res, next) => {
        UserController
            .reported(res.locals.user, req.query)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        filter: User.FILTERS.PUBLIC,
                        show_report_stats: true,
                        show_social_stats: true,
                        show_submission_stats: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

router.post('/:id?/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:user:update', 'user:user:update']]
    }),
    needs.body({
        email_:             'str',
        username_:          'str',
        password_:          'str',
        full_name_:         'str',
        bio_:               'str',
        location_:          'str',
        phone_:             'str',
        twitter_handle_:    'str',
        radius_:            needs.miles_to_meters,
        installation_: { // Used for push notifications + linking devices to users
            device_id_:          'str', // DEPRECATED
            app_version:        'str',
            platform:           ['ios', 'android'],
            device_token_:       'str',
            old_device_token_:  'str',
            timezone_:          'str', // TODO What type??
            locale_identifier_: 'str'
        },
        address_: { // Can address be partially updated? (if is not set?)
            line1_:         'str',
            line2_:         'str',
            city_:          'str',
            state_:         'str',
            postal_code_:   'str',
            country_:       'str'
        },
        dob_: { // Can dob be partially updated? (if is not set?)
            day:            'int',
            month:          'int',
            year:           'int'
        },
        account_type_:      ['individual', 'corporation'], // Stripe entity_type
        first_name_:        'str', // Stripe info
        last_name_:         'str', // Stripe info
        currency_:          'str', // User's currency code (default usd)
        tax_id_:            'str', // For corporations, used by Stripe
        vat_id_:            'str', // For companies in the EU, used by Stripe
        pid_token_:         'str', // Stripe.JS personal ID # token
        ssn_last4_:         'str',
        document_token_:    'str', // Stripe.JS uploaded verification file token

        verify_password_: 'str', // For verifying password when updating certain fields

        token_: 'str', // For verifying the user when they don't have a password
        secret_: 'str',
        jwt_: 'str',
        platform_: ['facebook', 'twitter', 'google']
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .update(res.locals.user, req.params.id, req.body, trx)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        show_outlet: true,
                        show_social_links: true,
                        show_roles: true,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_terms: true,
                        show_identity: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next)
    }
);

router.get('/:id?/posts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['user:user:get', 'user:post:get'],
        client: ['client:user:get', 'client:post:get']
    }),
    needs.querystring({
        rating_: [['int', 'int[]']],
        status_: [['int', 'int[]']]
    }).including(needs.pagination),
    (req, res, next) => {
        PostController
            .getByUser(req.params.id, req.query, res.locals)
            .then(p => PostController.build(p, Object.assign({
                show_parent: true,
                show_owner: true,
                show_purchased: true,
            }, res.locals)))
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/follow',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-follow:create'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        UserController
            .follow(req.params.id, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/unfollow',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-follow:delete'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        UserController
            .unfollow(req.params.id, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/:id?/following',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-follow:get',
        client: 'user:user-follow:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        UserController
            .following(res.locals.user, req.params.id, req.query)
            .then(u => UserController.build(res.locals.user, u, {
                filter: User.FILTERS.PUBLIC,
                show_social_stats: true,
                show_submission_stats: true
            }))
            .then(r => res.send(r))
            .catch(next);
    }
);

// TODO only allow params field for those with admin:social:get
router.get('/:id?/followers',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-follow:get',
        client: 'client:user-follow:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        UserController
            .followers(res.locals.user, req.params.id, req.query)
            .then(u => UserController.build(res.locals.user, u, {
                filter: User.FILTERS.PUBLIC,
                show_social_stats: true,
                show_submission_stats: true
            }))
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/block',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-block:create'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .block(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/unblock',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-block:delete'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .unblock(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/suspend',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user:update'
    }),
    needs.spat_id,
    needs.body({ suspended_until: 'datetime' }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .suspend(res.locals.user, req.params.id, req.body.suspended_until, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/unsuspend',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user:update'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .unsuspend(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:user:delete', 'user:user:delete']]
    }),
    needs.no.body,
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .delete(res.locals.user, req.params.id, trx)
            .then(r => res.send({ success: 'ok' }))
            .then(trx.commit)
            .catch(next);
    }
);

router.get('/:id/reports',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-report:get'
    }),
    needs.spat_id,
    needs.pagination,
    (req, res, next) => {
        UserController
            .reports(res.locals.user, req.params.id, req.query)
            .then(r =>
                ReportController
                    .build(res.locals.user, r, {
                        show_user: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/:id/report',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user-report:create'
    }),
    needs.spat_id,
    needs.body({
        reason: ['spam', 'abuse', 'stolen'],
        message: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .report(res.locals.user, req.params.id, req.body, trx)
            .then(r =>
                ReportController
                    .build(res.locals.user, r, {
                        show_user: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/report/skip',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-report:update'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .skipReport(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/:id/report/act',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:user-report:update'
    }),
    needs.spat_id,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        UserController
            .actReport(res.locals.user, req.params.id, trx)
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
    }
);

// TODO make ids only
router.get('/:username',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:user:get',
        client: 'client:user:get'
    }),
    username_spat,
    needs.no.querystring,
    (req, res, next) => {
        UserController
            .find(res.locals.user, req.params.username)
            .then(u =>
                UserController
                    .build(res.locals.user, u, {
                        filter: res.locals.user && res.locals.user.can('admin', 'get', 'user') ? User.FILTERS.ADMIN : User.FILTERS.PUBLIC,
                        show_social_stats: true,
                        show_submission_stats: true,
                        show_blocked: true,
                        show_disabled: true
                    })
            )
            .then(u => res.send(u))
            .catch(next);
    }
);

module.exports = router;