'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client Create - general', async t => {
    const AuthController = require('../../../controllers/Auth');
    const ApiVersionController = require('../../../controllers/ApiVersion');
    let user = await TestUtils.mockAdmin();
    let role = await AuthController.Role.getOne({ tag: 'public' });
    let api_version = await ApiVersionController.getCurrent();

    return TestUtils.rollback(async trx => {
        let client = await AuthController.Client.create(Object.assign({
            outlet_id: null,
            api_version_id: api_version.get('id'),
            role_id: role.get('id')
        }, TS.new_client), { trx, user });

        t.is(client.get('outlet_id'), null);
        t.is(client.get('redirect_uri'), 'localhost');
    });
});

test('Client Create - outlet', async t => {
    const AuthController = require('../../../controllers/Auth');
    const ApiVersionController = require('../../../controllers/ApiVersion');
    let user = await TestUtils.mockAdmin();
    let role = await AuthController.Role.getOne({ tag: 'public' });
    let api_version = await ApiVersionController.getCurrent();

    return TestUtils.rollback(async trx => {
        let client = await AuthController.Client.create(Object.assign({
            outlet_id: TS.outlet.id,
            api_version_id: api_version.get('id'),
            role_id: role.get('id')
        }, TS.new_client), { trx, user });

        t.is(parseInt(client.get('outlet_id'), 10), TS.outlet.id);
        t.is(client.get('redirect_uri'), 'localhost');
    });
});

test('Client Create - forbidden', async t => {
    const AuthController = require('../../../controllers/Auth');
    const ApiVersionController = require('../../../controllers/ApiVersion');
    const UserController = require('../../../controllers/User');
    const ferror = require('../../../lib/frescoerror');
    let user = await UserController.login(TS.evan.username, TS.evan.password);
    let role = await AuthController.Role.getOne({ tag: 'public' });
    let api_version = await ApiVersionController.getCurrent();

    return TestUtils.rollback(async trx => {
        try {
            await AuthController.Client.create(Object.assign({
                outlet_id: TS.outlet.id,
                api_version_id: api_version.get('id'),
                role_id: role.get('id')
            }, TS.new_client), { trx, user });
            throw new Exception('Succeeded unexpectedly');
        } catch (e) {
            if (ferror.isFresco(e)) t.is(e.type(), ferror.FORBIDDEN);
            else throw e;
        }
    });
});