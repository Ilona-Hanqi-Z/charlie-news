'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client GetByClientID', async t => {
    const AuthController = require('../../../controllers/Auth');
    let client = await AuthController.Client.getByClientID(TS.client.client_id);
    t.is(client.get('id'), String(TS.client.id));
});
