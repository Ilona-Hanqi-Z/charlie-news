'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Unfollow User', async t => {
    const UserController = require('../../../controllers/User');
    const FollowingUser = require('../../../models/following_users')
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // follow to set up unfollow environment
        await UserController.follow(TS.evan.id, { user, trx });

        // ensure there is now a following model for these users
        let pre_unfollow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });
        t.not(pre_unfollow_model, null);
        t.is(pre_unfollow_model.get('user_id'), user.get('id'));
        t.is(pre_unfollow_model.get('other_id'), String(TS.evan.id));
        t.is(pre_unfollow_model.get('active'), true);

        // unfollow user
        await UserController.unfollow(TS.evan.id, { user, trx });
        let post_unfollow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });

        t.not(post_unfollow_model, null);
        t.is(post_unfollow_model.get('user_id'), user.get('id'));
        t.is(post_unfollow_model.get('other_id'), String(TS.evan.id));
        t.is(post_unfollow_model.get('active'), false);
        t.true(pre_unfollow_model.get('action_at').getTime() < post_unfollow_model.get('action_at').getTime());
    });
});