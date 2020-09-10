'use strict';

import test from 'ava';
import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token - Client Credentials', async t => {
    let response = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'client_credentials',
            scope: 'read'
        })
        .expect(200)).body;

    t.is(response.token_type, 'Bearer');
    t.is(response.access_token.client.client_id, TS.client.client_id);
});

test('Access Token - URL Client Credentials', async t => {
    let response = (await TestUtils.supertest()
            .post('auth/token')
            .query({ 'auth_client': new Buffer(`${TS.client.client_id}:${TS.client.client_secret}`).toString('base64') })
            .send({
                grant_type: 'client_credentials',
                scope: 'read'
            })
            .expect(200)
    ).body;

    t.is(response.token_type, 'Bearer');
    t.is(response.access_token.client.client_id, TS.client.client_id);
});
