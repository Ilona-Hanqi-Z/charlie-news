'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client Delete - general', async t => {
    const AuthController = require('../../../controllers/Auth');
    let user = await TestUtils.mockAdmin();

    return TestUtils.rollback(async trx => {
        await AuthController.Client.delete(TS.client.id, { trx, user });
    });
});

test('Client Delete - forbidden', async t => {
    const AuthController = require('../../../controllers/Auth');
    const UserController = require('../../../controllers/User');
    const ferror = require('../../../lib/frescoerror');
    let user = await UserController.login(TS.evan.username, TS.evan.password);

    return TestUtils.rollback(async trx => {
        try {
            await AuthController.Client.delete(TS.client.id, { trx, user });
            throw new Exception('Succeeded unexpectedly');
        } catch (e) {
            if (ferror.isFresco(e)) t.is(e.type(), ferror.FORBIDDEN);
            else throw e;
        }
    });
});