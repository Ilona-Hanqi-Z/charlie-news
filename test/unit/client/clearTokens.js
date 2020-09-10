'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client Clear Tokens', async t => {
    const AuthController = require('../../../controllers/Auth');
    const client = await AuthController.Client.authenticate(TS.client.client_id, TS.client.client_secret);
    let user = await TestUtils.mockAdmin();

    return TestUtils.rollback(async trx => {
        await AuthController.Client.clear(client, { trx, user });
        let tokens = await client.access_tokens().fetch({ transacting: trx });
        t.is(tokens.length, 0);
    });
});