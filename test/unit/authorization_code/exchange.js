'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Authorization Code Exchange', async t => {
    const AuthController = require('../../../controllers/Auth');
	let client = await AuthController.Client.authenticate(TS.client.client_id, TS.client.client_secret);
	let auth_code = await AuthController.AuthorizationCode.resolve(TS.ryan_authorization_code.token);

    return TestUtils.rollback(async trx => {
        let access_token = await AuthController.AuthorizationCode.exchange(TS.ryan_authorization_code.token, { client, trx });
		t.is(access_token.get('client_id'), client.get('id'));
		t.is(access_token.get('role_id'), auth_code.get('role_id'));
    });
});