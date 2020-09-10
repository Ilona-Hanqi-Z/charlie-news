'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token Resolve', async t => {
    const AccessTokenController = require('../../../controllers/Auth/AccessToken');
    return TestUtils.rollback(async trx => {
        let token_model = await AccessTokenController.resolve(TS.ryan_access_token.token, trx);
		t.is(token_model.related('user').get('username'), TS.ryan.username);
    });
});