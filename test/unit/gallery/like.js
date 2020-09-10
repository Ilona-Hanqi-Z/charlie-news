'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Like Gallery (new like)', async t => {
    const UserController = require('../../../controllers/User');
    const GalleryController = require('../../../controllers/Gallery');
    const GalleryLike = require('../../../models/gallery_like');
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // ensure there is no pre-existing like model for this gallery
        let like_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });
        t.is(like_model, null);

        // like gallery for the first time
        await GalleryController.Social.like(user, TS.gallery.id, null, trx);
        like_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });

        t.not(like_model, null);
        t.is(like_model.get('user_id'), user.get('id'));
        t.is(like_model.get('gallery_id'), String(TS.gallery.id));
        t.is(like_model.get('active'), true);
    });
});

test('Like Gallery (repeat like)', async t => {
    const UserController = require('../../../controllers/User');
    const GalleryController = require('../../../controllers/Gallery');
    const GalleryLike = require('../../../models/gallery_like')
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // like and unlike to set up repeat-like environment
        await GalleryController.Social.like(user, TS.gallery.id, null, trx);
        await GalleryController.Social.unlike(user, TS.gallery.id, trx);

        // get the like model before the relike
        let pre_like_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });
        t.not(pre_like_model, null);
        t.is(pre_like_model.get('user_id'), user.get('id'));
        t.is(pre_like_model.get('gallery_id'), String(TS.gallery.id));
        t.is(pre_like_model.get('active'), false);

        // like user again
        await GalleryController.Social.like(user, TS.gallery.id, null, trx);
        let post_like_model = await GalleryLike.where({ user_id: user.get('id'), gallery_id: TS.gallery.id }).fetch({ transacting: trx });

        t.not(post_like_model, null);
        t.is(post_like_model.get('user_id'), user.get('id'));
        t.is(post_like_model.get('gallery_id'), String(TS.gallery.id));
        t.is(post_like_model.get('active'), true);
        t.true(pre_like_model.get('action_at').getTime() < post_like_model.get('action_at').getTime());
    });
});