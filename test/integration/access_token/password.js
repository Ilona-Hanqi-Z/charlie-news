'use strict';

import test from 'ava';
import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token - Password', async t => {
    const hashIds = require('../../../lib/hashids');
    let response = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'password',
            scope: 'read',
            username: TS.ryan.username,
            password: TS.ryan.password
        })
        .expect(200)).body;

    t.is(response.token_type, 'Bearer');
    t.is(response.access_token.client.client_id, TS.client.client_id);
    t.is(response.access_token.user_id, hashIds.encode(TS.ryan.id));
});