'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

// TODO Deprecated
test('Register - Password', async t => {
    const AuthController = require('../../../controllers/Auth');
    const UserController = require('../../../controllers/User');
    let client = await AuthController.Client.authenticate(TS.client.client_id, TS.client.client_secret);
    return TestUtils.rollback(async trx => {
        let response = await AuthController.register({
            email: TS.new_user.email,
            username: TS.new_user.username,
            password: TS.new_user.password,
            oauth_client: client
        }, trx);

        let user_id = parseInt(response.user.get('id'));
        let created_user = await UserController.get(null, user_id, trx);

        t.is(created_user.get('username'), TS.new_user.username);
    });
});
