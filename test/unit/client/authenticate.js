'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Client Authenticate', async t => {
    const ClientController = require('../../../controllers/Auth/Client');
    return TestUtils.rollback(async trx => {
        let client_model = await ClientController.authenticate(TS.client.client_id, TS.client.client_secret, trx);
        t.is(client_model.get('redirect_uri'), 'localhost');
    });
});