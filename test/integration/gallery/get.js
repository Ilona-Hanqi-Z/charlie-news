'use strict';

import test from 'ava';
import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Gallery Get', async t => {
    const hashIds = require('../../../lib/hashids');
    let gallery = (await TestUtils.supertest()
        .get(`gallery/${hashIds.encode(TS.gallery.id)}`)
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .expect(200)).body;

    t.is(hashIds.decode(gallery.id), TS.gallery.id);
});

test('Gallery Get 404', async t => {
    await TestUtils.supertest()
        .get('gallery/YZb485MJ8xoV') //This gallery doesn't exist
        .set("Authorization", 'Basic ' + new Buffer(TS.client.client_id + ':' + TS.client.client_secret).toString('base64'))
        .expect(404);
});