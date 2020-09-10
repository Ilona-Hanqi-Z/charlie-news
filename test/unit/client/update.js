'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client Update - general', async t => {
    const AuthController = require('../../../controllers/Auth');
    let user = await TestUtils.mockAdmin();

    return TestUtils.rollback(async trx => {
        let client = await AuthController.Client.update(TS.client.id, { redirect_uri: null, rekey: true }, { trx, user });

        t.is(client.get('redirect_uri'), null);
        t.not(client.get('client_secret'), null);
        t.not(client.get('client_secret'), TS.client.client_secret);
    });
});

test('Client Update - outlet', async t => {
    const AuthController = require('../../../controllers/Auth');
    let user = await TestUtils.mockAdmin();

    return TestUtils.rollback(async trx => {
        let client = await AuthController.Client.update(TS.outlet_client.id, { redirect_uri: null, rekey: true }, { trx, user });

        t.is(client.get('redirect_uri'), null);
        t.not(client.get('client_secret'), null);
        t.not(client.get('client_secret'), TS.new_client.client_secret);
    });
});

test('Client Update - forbidden', async t => {
    const AuthController = require('../../../controllers/Auth');
    const UserController = require('../../../controllers/User');
    const ferror = require('../../../lib/frescoerror');
    let user = await UserController.login(TS.evan.username, TS.evan.password);

    return TestUtils.rollback(async trx => {
        try {
            let client = await AuthController.Client.update(TS.outlet_client.id, { redirect_uri: null, rekey: true }, { trx, user });
            throw new Exception('Succeeded unexpectedly');
        } catch (e) {
            if (ferror.isFresco(e)) t.is(e.type(), ferror.FORBIDDEN);
            else throw e;
        }
    });
});