'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Disable User', async t => {
    const UserController = require('../../../controllers/User');
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);
        t.is(user.get('expires_at'), null);

        let disable_params = {
            username: TS.ryan.username,
            email: TS.ryan.email,
            password: TS.ryan.password
        };
        await UserController.disable(user, disable_params, trx);
        t.not(user.get('expires_at'), null);

        await UserController.enable(user, {}, trx);
        t.is(user.get('expires_at'), null);
    });
});

test('Disable User Content', async t => {
    const UserController = require('../../../controllers/User');
    const GalleryController = require('../../../controllers/Gallery');
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);
        let gallery = await GalleryController.get(TS.gallery.id, { user, trx });

        t.is(user.get('expires_at'), null);
        t.is(gallery.get('caption'), TS.gallery.caption);

        let disable_params = {
            username: TS.ryan.username,
            email: TS.ryan.email,
            password: TS.ryan.password
        };
        await UserController.disable(user, disable_params, trx);
        t.not(user.get('expires_at'), null);

        await UserController.enable(user, {}, trx);
        t.is(user.get('expires_at'), null);

        await t.notThrows(GalleryController.get(TS.gallery.id, { user, trx }));
    });
});

test('Delete User', async t => {
    const UserController = require('../../../controllers/User');
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        t.is(user.get('username'), TS.ryan.username);

        await UserController.delete(user, user.get('id'), trx);

        t.throws(UserController.get(null, TS.ryan.id, trx));
    });
});

test('Delete User Content', async t => {
    const UserController = require('../../../controllers/User');
    const GalleryController = require('../../../controllers/Gallery');
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);
        let gallery = await GalleryController.get(TS.gallery.id, { user, trx });

        t.is(user.get('username'), TS.ryan.username);
        t.is(gallery.get('caption'), TS.gallery.caption);

        await UserController.delete(user, user.get('id'), trx);
        await t.throws(UserController.get(null, TS.ryan.id, trx));
        await t.throws(GalleryController.get(TS.gallery.id, { user, trx }));
    });
});
