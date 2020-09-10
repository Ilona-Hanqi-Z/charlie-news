'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client List - general', async t => {
    const AuthController = require('../../../controllers/Auth');
    let user = await TestUtils.mockAdmin();
    let clients = await AuthController.Client.list({}, { user });

    t.is(clients.length, 1);
    t.is(clients[0].get('redirect_uri'), 'localhost');
});

test('Client List - outlet', async t => {
    const AuthController = require('../../../controllers/Auth');
    const ApiVersionController = require('../../../controllers/ApiVersion');
    let user = await TestUtils.mockAdmin();
    let clients = await AuthController.Client.list({ outlet_id: TS.outlet.id }, { user });

    t.is(clients.length, 2);
    t.is(clients[0].get('client_id'), 'client1');
    t.is(clients[1].get('client_id'), 'client2');
});

test('Client List - forbidden', async t => {
    const AuthController = require('../../../controllers/Auth');
    const UserController = require('../../../controllers/User');
    const ferror = require('../../../lib/frescoerror');
    let user = await UserController.login(TS.evan.username, TS.evan.password);

    try {
        await AuthController.Client.list({}, { user });
        throw new Exception('Succeeded unexpectedly');
    } catch (e) {
        if (ferror.isFresco(e)) t.is(e.type(), ferror.FORBIDDEN);
        else throw e;
    }
});