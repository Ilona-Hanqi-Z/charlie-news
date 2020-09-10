'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token Refresh', async t => {
    const AccessTokenController = require('../../../controllers/Auth/AccessToken');
    return TestUtils.rollback(async trx => {
        let token_model = await AccessTokenController.refresh(TS.ryan_access_token.refresh_token, trx);
        t.not(token_model, false);
        t.not(token_model.get('token'), TS.ryan_access_token.token);
        t.not(token_model.get('refresh_token'), TS.ryan_access_token.refresh_token);
    });
});