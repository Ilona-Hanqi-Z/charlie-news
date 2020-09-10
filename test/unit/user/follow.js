'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Follow User (new follower)', async t => {
    const UserController = require('../../../controllers/User');
    const FollowingUser = require('../../../models/following_users')
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // ensure there is no pre-existing following model for these users
        let follow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });
        t.is(follow_model, null);

        // follow user for the first time
        await UserController.follow(TS.evan.id, { user, trx });
        follow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });

        t.not(follow_model, null);
        t.is(follow_model.get('user_id'), user.get('id'));
        t.is(follow_model.get('other_id'), String(TS.evan.id));
        t.is(follow_model.get('active'), true);
    });
});

test('Follow User (repeat follower)', async t => {
    const UserController = require('../../../controllers/User');
    const FollowingUser = require('../../../models/following_users')
    return TestUtils.rollback(async trx => {
        let user = await UserController.get(null, TS.ryan.id, trx);

        // follow and unfollow to set up repeat follower environment
        await UserController.follow(TS.evan.id, { user, trx });
        await UserController.unfollow(TS.evan.id, { user, trx });

        // get the following model before the refollow
        let pre_follow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });
        t.not(pre_follow_model, null);
        t.is(pre_follow_model.get('user_id'), user.get('id'));
        t.is(pre_follow_model.get('other_id'), String(TS.evan.id));
        t.is(pre_follow_model.get('active'), false);

        // follow user again
        await UserController.follow(TS.evan.id, { user, trx });
        let post_follow_model = await FollowingUser.where({ user_id: user.get('id'), other_id: TS.evan.id }).fetch({ transacting: trx });

        t.not(post_follow_model, null);
        t.is(post_follow_model.get('user_id'), user.get('id'));
        t.is(post_follow_model.get('other_id'), String(TS.evan.id));
        t.is(post_follow_model.get('active'), true);
        t.true(pre_follow_model.get('action_at').getTime() < post_follow_model.get('action_at').getTime());
    });
});