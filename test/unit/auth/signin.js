'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

// TODO Deprecated
test('Sign In - Username', async t => {
    const AuthController = require('../../../controllers/Auth');
    const OAuthClient = require('../../../models/oauth_client');

    let client = await OAuthClient.where({ client_id: TS.client.client_id }).fetch();

    let response = await AuthController.signin({
        username: TS.ryan.username,
        password: TS.ryan.password,
        client
    });

    t.is(parseInt(response.user.get('id')), TS.ryan.id);
});