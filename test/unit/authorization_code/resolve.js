'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Authorization Code Resolve', async t => {
    const AuthCodeController = require('../../../controllers/Auth/AuthCode');
    let auth_code = await AuthCodeController.resolve(TS.ryan_authorization_code.token);
    t.is(auth_code.get('id'), String(TS.ryan_authorization_code.id));
});