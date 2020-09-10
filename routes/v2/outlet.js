'use strict';

const bcrypt = require('bcryptjs');
const express = require('express');
const Promise = require('bluebird');

const middleware = require('../../middleware');

const ferror = require('../../lib/frescoerror');
const needs = require('../../lib/needs');
const upload = require('../../lib/multer');

const Outlet = require('../../models/outlet');

const OutletController = require('../../controllers/Outlet');
const PostController = require('../../controllers/Post');

const router = express.Router();

/**
 * Base Route
 * /v2/outlet/
 */

/**
 * Gets the tokened user's outlet
 * @return {object} The user's outlet, with an owner
 */
router.get('/me',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet:get'
    }),
    needs.no.querystring,
    (req, res, next) => {
        OutletController
            .build(res.locals.user, res.locals.user.related('outlet'), {
                filters: Outlet.FILTERS.SELF,
                show_owner: true,
                show_members: true
            })
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Creates a new outlet
 * 
 * TODO params
 */
router.post('/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:outlet:create'
    }),
    (req, res, next) => {
        OutletController
            .create(req.body)
            .then(r =>
                OutletController
                    .build(res.locals.user, r, {
                        filters: Outlet.FILTERS.SELF,
                        show_owner: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
});

/**
 * Removes member from the outlet
 */
router.post('/members/remove',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-member:delete'
    }),
    needs.body({
        user_id: 'int'
    }),
    (req, res, next) => {
        OutletController.Members
            .removeMember(req.body.user_id, res.locals)
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Sends invite to the passed email
 */
router.post('/invite',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-invite:create'
    }),
    needs.body({ emails: 'str[]' }),
    (req, res, next) => {
        OutletController.Members
            .invite(res.locals.user, req.body.emails)
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Lists invites for a passed outlet or user's outlet
 */
router.get('/invite/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-invite:get'
    }),
    (req, res, next) => {
        OutletController.Members
            .listInvites(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
    }
);


/**
 * Revokes invite with the passed token
 */
router.post('/invite/revoke',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-invite:delete'
    }),
    needs.body({
        token: 'str'
    }),
    (req, res, next) => {
        OutletController.Members
            .revokeInvite(res.locals.user, req.body.token)
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Resends invite with the passed token
 */
router.post('/invite/resend',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-invite:update'
    }),
    needs.body({
        token: 'str'
    }),
    (req, res, next) => {
        OutletController.Members
            .resendInvite(res.locals.user, req.body.token)
            .then(r => res.send(r))
            .catch(next);
    }
);

/**
 * Resends invite with the passed token
 */
router.post('/invite/accept',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'user:outlet-invite:update'
    }),
    needs.body({
        token: 'str'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;

        OutletController.Members
            .join(res.locals.user, req.body.token, trx)
            .then(r => {
                trx.commit();
                res.send(r)
            })
            .catch(next);
    }
);

/**
 * Resolves invite with the passed token
 */
router.get('/invite/:token',
    middleware.auth.permissions({
        user: [['outlet:outlet-invite:get', 'user:outlet-invite:get']],
        client: 'client:outlet-invite:get'
    }),
    (req, res, next) => {
        OutletController.Members
            .getInvite(req.params.token)
            .then(r => res.send(r))
            .catch(next);
    }
);

router.post('/locations/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-location:create'
    }),
    needs.body({
        title: 'str255',
        geo: needs.geoJSON,
        send_email_default_: 'bool',
        send_sms_default_: 'bool',
        send_fresco_default_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        OutletController.Location
            .create(res.locals.user, req.body, trx)
            .then(locs =>
                OutletController.Location
                    .build(res.locals.user, locs, {
                        show_settings: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
});

/**
 * Either lists all of the outlet's locations, or returns the location matching the pased id `loc_id`
 */
router.get('/locations/:id?',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:outlet-location:get', 'outlet:outlet-location:get']]
    }),
    needs.spat_id,
    needs.querystring({
        outlet_id_: 'int',
        since_: 'datetime'
    }).including(needs.pagination),
    (req, res, next) => {
        req.query.loc_id = req.params.id;
        OutletController.Location
            .get(res.locals.user, req.query)
            .then(locs =>
                OutletController.Location
                    .build(res.locals.user, locs, {
                        show_unseen_since: req.query.since,
                        show_settings: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
});

router.post('/locations/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-location:delete'
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        OutletController.Location
            .delete(res.locals.user, req.params.id)
            .then(r => res.send(r))
            .catch(next);
});

router.get('/locations/:id/posts',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['outlet:outlet-location:get', 'user:post:get']
    }),
    needs.spat_id,
    needs.querystring({
        since: 'datetime'
    }).including(needs.pagination),
    (req, res, next) => {
        OutletController.Location
            .posts(res.locals.user, req.params.id, req.query)
            .then(p =>
                PostController
                    .build(p, Object.assign({
                        show_parent: true,
                        show_owner: true,
                        show_purchased: true
                    }, res.locals))
            )
            .then(r => res.send(r))
            .catch(next);
});

router.post('/locations/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-location:update'
    }),
    needs.spat_id,
    needs.body({
        title_: 'str255',
        geo_: needs.geoJSON,
        send_email_default_: 'bool',
        send_sms_default_: 'bool',
        send_fresco_default_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        OutletController.Location
            .update(res.locals.user, req.params.id, req.body)
            .then(loc =>
                OutletController.Location
                    .build(res.locals.user, loc, {
                        show_settings: true,
                        trx
                    })
            )
            .then(r => res.send(r))
            .then(trx.commit)
            .catch(next);
});

router.post('/locations/:ids/settings/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: ['outlet:outlet-location:get', 'user:settings:update']
    }),
    needs.spat_ids,
    needs.body({
        send_email_: 'bool',
        send_fresco_: 'bool',
        send_sms_: 'bool',
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx;
        Promise
            .map(req.params.ids, location_id =>
                OutletController.Location
                    .updateSetting(res.locals.user, { location_id, settings: req.body }, trx)
            )
            .then(locs =>
                OutletController.Location
                    .build(res.locals.user, locs, {
                        show_unseen_since: req.query.since,
                        show_settings: true,
                        trx
                    })
            )
            .then(results => res.send(results))
            .then(trx.commit)
            .catch(next);
    }
);

/**
 * Lists the outlet's payment methods
 */
router.get('/payment/:ids?',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-payment:get'
    }),
    needs.spat_ids,
    needs.no.querystring,
    (req, res, next) => {
        OutletController.Payment
            .listMethods(res.locals.user, req.params.ids)
            .then(result => res.send(result))
            .catch(next);
    }
);

router.post('/payment/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-payment:delete'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        OutletController.Payment
            .removeMethod(res.locals.user, req.params.id, trx)
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/payment/:id/activate',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-payment:update'
    }),
    needs.spat_id,
    needs.no.body,
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        OutletController.Payment
            .setActiveMethod(res.locals.user, req.params.id, trx)
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

// NOTE: If token is a bank token, token MUST have been created
// by providing the bank holder's name.  Use the parameter usage='source'
// when creating the token to validate it
router.post('/payment/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet-payment:create'
    }),
    needs.body({
        token: 'str',
        active_: 'bool'
    }),
    middleware.makeTransaction,
    (req, res, next) => {
        let trx = res.locals.trx
        OutletController.Payment
            .createMethod(res.locals.user, req.body, trx)
            .then(result => res.send(result))
            .then(trx.commit)
            .catch(next);
    }
);

router.post('/avatar',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet:update'
    }),
    needs.no.body,
    upload.single('avatar'),
    (req, res, next) => {
        OutletController
            .updateAvatar(res.locals.user, req.file)
            .then(r =>
                OutletController
                    .build(res.locals.user, r, {
                        filters: Outlet.FILTERS.SELF,
                        show_owner: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

router.get('/stats',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:outlet:get', 'outlet:outlet:get']]
    }),
    needs.querystring({
        before_: 'datetime',
        after_: 'datetime',
        outlet_ids_: 'int[]'
    }),
    (req, res, next) => {
        OutletController
            .stats(res.locals.user, req.query)
            .then(r => res.send(r))
            .catch(next);
    }
);

// TODO implement length limits here?
// TODO test updating
router.post('/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:outlet:update', 'outlet:outlet:update']]
    }),
    needs.body({
        title_: 'str',
        bio_: 'str',
        link_: 'str',
        avatar_: 'str',
        goal_: 'int',
    }),
    (req, res, next) => {
        OutletController
            .update(res.locals.user, req.body)
            .then(r =>
                OutletController
                    .build(res.locals.user, r, {
                        filters: Outlet.FILTERS.SELF,
                        show_owner: true
                    })
            )
            .then(r => res.send(r))
            .catch(next)
    }
);

router.post('/export/email',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:outlet:get', 'outlet:outlet:get']]
    }),
    needs.no.body,
    (req, res, next) => {
        OutletController
            .statement(res.locals.user, req.body)
            .then(r => res.send(r))
            .catch(next);
    }
);


router.post('/dispatch/request',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'outlet:outlet:update'
    }),
    needs.body({
       comment: 'str'
    }),
    (req, res, next) => {
        OutletController
            .requestDispatch(res.locals.user, req.body)
            .then(res.send)
            .catch(next);
    }
);

/**
 * Gets the outlet from the passed ID
 * @description Only accessible by Admins/CMs
 * @return {object} The outlet from the passed ID, with an owner
 */
router.get('/:id?',
    middleware.hashIds,
    middleware.auth.permissions({
        user: 'admin:outlet:get'
    }),
    needs.no.querystring,
    (req, res, next) => {
        OutletController
            .get(res.locals.user, req.params.id)
            .then(r =>
                OutletController
                    .build(res.locals.user, r, {
                        filters: Outlet.FILTERS.SELF,
                        keep_fields: ['goal'],
                        show_owner: true
                    })
            )
            .then(r => res.send(r))
            .catch(next);
    }
);

module.exports = router;