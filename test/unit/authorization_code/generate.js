'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Authorization Code Generate', async t => {
    const AuthController = require('../../../controllers/Auth');
    const UserController = require('../../../controllers/User');
	let client = await AuthController.Client.authenticate(TS.client.client_id, TS.client.client_secret);
	let user = await UserController.login(TS.ryan.email, TS.ryan.password);
    let role = await AuthController.Role.getOne({ tag: 'write' });

    return TestUtils.rollback(async trx => {
        let auth_code_model = await AuthController.AuthorizationCode.generate({
            client,
            role,
            redirect_uri: client.get('redirect_uri')
        }, {
            user,
            trx
        });

		t.is(auth_code_model.get('client_id'), client.get('id'));
		t.is(auth_code_model.get('role_id'), role.get('id'));
    });
});