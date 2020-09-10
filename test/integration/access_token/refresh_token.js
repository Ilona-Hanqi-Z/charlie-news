'use strict';

import test from 'ava';
import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token - Refresh Token', async t => {
    const hashIds = require('../../../lib/hashids');
    let new_token = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'client_credentials',
            scope: 'read'
        })
        .expect(200)).body.access_token;
    let response = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'refresh_token',
            scope: 'public',
            refresh_token: new_token.refresh_token
        })
        .expect(200)).body;

    t.is(response.token_type, 'Bearer');
    t.is(response.access_token.client.client_id, new_token.client.client_id);
    t.not(response.access_token.token, new_token.token);
    t.not(response.access_token.refresh_token, new_token.refresh_token);
    t.falsy(response.access_token.user_id);
});