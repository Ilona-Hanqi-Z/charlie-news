'use strict';

import test from 'ava';
import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Access Token - Authorization Code', async t => {
    const hashIds = require('../../../lib/hashids');

    // Authenticate user so they can authorize client
    let password_bearer = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'password',
            username: TS.ryan.username,
            password: TS.ryan.password,
            scope: 'write'
        })
        .expect(200)).body.access_token.token;

    // Generate an auth code for granting client access
    let auth_code = (await TestUtils.supertest()
        .post(`auth/authorize`)
        .set("Authorization", 'Bearer ' + password_bearer)
        .send({
            client_id: TS.client.client_id,
            redirect_uri: TS.client.redirect_uri,
            scope: 'read',
            state: 'state'
        })
        .expect(200)).body;

    t.is(auth_code.state, 'state');
    t.is(auth_code.role.tag, 'read');
    t.is(auth_code.user_id, hashIds.encode(TS.ryan.id));
    t.is(auth_code.redirect_uri, TS.client.redirect_uri);

    // Exchange auth code for access token
    let response = (await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'authorization_code',
            code: auth_code.token
        })
        .expect(200)).body;

    t.is(response.token_type, 'Bearer');
    t.is(response.access_token.client.id, hashIds.encode(TS.client.id));
    t.is(response.access_token.user_id, hashIds.encode(TS.ryan.id));
    t.is(response.access_token.role.tag, 'read');

    // Verify auth code was deleted
    await TestUtils.supertest()
        .post(`auth/token`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .send({
            grant_type: 'authorization_code',
            code: auth_code.token
        })
        .expect(400)

    // Delete the access tokens that were created
    await TestUtils.supertest()
        .delete(`auth/token`)
        .set("Authorization", 'Bearer ' + password_bearer)
        .expect(200);
    await TestUtils.supertest()
        .delete(`auth/token`)
        .set("Authorization", 'Bearer ' + response.access_token.token)
        .expect(200);
});