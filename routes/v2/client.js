'use strict';

const AuthController = require('../../controllers/Auth');
const express = require('express');
const ferror = require('../../lib/frescoerror');
const middleware = require('../../middleware');
const needs = require('../../lib/needs');

const router = express.Router();

router.get('/me',
    middleware.hashIds,
    middleware.auth.permissions({
        client: 'client:client:get'
    }),
    (req, res, next) => {
        AuthController.Client
            .build(res.locals.client, Object.assign({
                show_api_version: true,
                show_family: true,
                show_role: true
            }, res.locals))
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/generate',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:create', 'outlet:client:create']]
    }),
    needs.body({
        api_version_id: 'int',
        family_id_: ['int', 'null'],
        scope: ['public', 'private'],
        outlet_id_: 'int',
        tag_: [['str', 'null']],
        enabled_: 'bool',
        redirect_uri_: 'str'
    }),
    (req, res, next) => {
        AuthController.Role
            .getOne({ entity: 'client', tag: req.body.scope || 'public' })
            .then(role_model => // Role should ALWAYS exist, since the scope can only be public or private
                AuthController.Client.create(Object.assign(req.body, { role_id: role_model.get('id') }), res.locals)
            )
            .then(c =>
                AuthController.Client
                    .build(c, Object.assign({
                        keep_fields: 'client_secret',
                        show_api_version: true,
                        show_family: true,
                        show_role: true
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.get('/list',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:get', 'outlet:client:get']]
    }),
    needs.querystring({
        outlet_id_: 'int'
    }),
    (req, res, next) => {
        AuthController.Client
            .list(req.query, res.locals)
            .then(c =>
                AuthController.Client
                    .build(c, Object.assign({
                        show_api_version: true,
                        show_family: true,
                        show_role: true
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/family/create',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client-family:create', 'user:client-family:create']]
    }),
    needs.body({
        tag: 'str',
        outlet_id_: [['int', 'null']]
    }),
    (req, res, next) => {
        AuthController.Client
            .makeFamily(req.body, res.locals)
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/family/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client-family:delete', 'user:client-family:delete']]
    }),
    needs.spat_id,
    needs.no.body,
    (req, res, next) => {
        AuthController.Client
            .deleteFamily(req.params.id, res.locals)
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.get('/:client_id/secret',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:get', 'outlet:client:get']]
    }),
    (req, res, next) => {
        AuthController.Client
            .getByClientID(req.params.client_id, true, res.locals)
            .then(c => 
                AuthController
                    .Client
                    .build(c, Object.assign({
                        keep_fields: ['client_secret']
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/:id/update',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:update', 'outlet:client:update']]
    }),
    needs.spat_id,
    needs.body({
        api_version_id_: 'int',
        family_id_: [['int', 'null']],
        scope_: ['public', 'private'],
        tag_: [['str', 'null']],
        enabled_: 'bool',
        redirect_uri_: 'str',
        rekey_: 'bool'
    }),
    (req, res, next) => {
        AuthController.Client
            .update(req.params.id, req.body, res.locals)
            .then(c =>
                AuthController.Client
                    .build(c, Object.assign({
                        keep_fields: ['client_secret'],
                        show_api_version: true,
                        show_family: true,
                        show_role: true
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .catch(next);
    }
);

router.post('/:id/delete',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:delete', 'outlet:client:delete']]
    }),
    needs.no.body,
    (req, res, next) => {
        AuthController.Client
            .delete(req.params.id, res.locals)
            .then(() => res.send({ result: 'ok' }))
            .catch(next);
    }
);

router.get('/:id',
    middleware.hashIds,
    middleware.auth.permissions({
        user: [['admin:client:get', 'outlet:client:get']]
    }),
    needs.querystring({
        show_secret_: 'bool'
    }),
    (req, res, next) => {
        AuthController.Client
            .getById(req.params.id, Object.assign(res.locals, req.query))
            .then(c => 
                AuthController
                    .Client
                    .build(c, Object.assign({
                        keep_fields: ['client_secret'],
                        show_api_version: true,
                        show_family: true,
                        show_role: true
                    }, res.locals))
            )
            .then(res.send.bind(res))
            .catch(next);
    }
);

module.exports = router;