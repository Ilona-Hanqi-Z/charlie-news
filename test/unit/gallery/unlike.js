'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Unlike Gallery', async t => {
    const UserController = require('../../../controllers/User');
    const GalleryController = require('../../../controllers/Gallery');
    const GalleryLike = require('../../../models/gallery_like')
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // like to set up unlike environment
        await GalleryController.Social.like(user, TS.gallery.id, null, trx);

        // ensure there is now a following model for these users
        let pre_unlike_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });
        t.not(pre_unlike_model, null);
        t.is(pre_unlike_model.get('user_id'), user.get('id'));
        t.is(pre_unlike_model.get('gallery_id'), String(TS.gallery.id));
        t.is(pre_unlike_model.get('active'), true);

        // unfollow user
        await GalleryController.Social.unlike(user, TS.gallery.id, trx);
        let post_unlike_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });

        t.not(post_unlike_model, null);
        t.is(post_unlike_model.get('user_id'), user.get('id'));
        t.is(post_unlike_model.get('gallery_id'), String(TS.gallery.id));
        t.is(post_unlike_model.get('active'), false);
        t.true(pre_unlike_model.get('action_at').getTime() < post_unlike_model.get('action_at').getTime());
    });
});