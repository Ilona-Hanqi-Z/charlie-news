'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token Generate', async t => {
    const AuthController = require('../../../controllers/Auth');
	let client = await AuthController.Client.authenticate(TS.client.client_id, TS.client.client_secret);
    let role = await AuthController.Role.getOne({ tag: 'write' });

    return TestUtils.rollback(async trx => {
		let token = await AuthController.AccessToken.generate(client, role.get('id'), TS.ryan.id, trx);
		t.is(token.get('client_id'), client.get('id'));
    });
});