'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Block User', async t => {
    const UserController = require('../../../controllers/User');
    return TestUtils.rollback(async trx => {
        let ryan = await UserController.get(null, TS.ryan.id, trx);
        let evan = await UserController.get(null, TS.evan.id, trx);

        await UserController.block(ryan, TS.evan.id, trx);
        t.true((await UserController.build(ryan, evan, { show_blocked: true, trx })).get('blocking'));

        await UserController.unblock(ryan, TS.evan.id, trx);
        t.false((await UserController.build(ryan, evan, { show_blocked: true, trx })).get('blocking'));
    });
});

test('Blocked by User', async t => {
    const UserController = require('../../../controllers/User');
    return TestUtils.rollback(async trx => {
        let evan = await UserController.get(null, TS.evan.id, trx);
        let ryan = await UserController.get(null, TS.ryan.id, trx);

        await UserController.block(evan, TS.ryan.id, trx);
        t.true((await UserController.build(ryan, evan, { show_blocked: true, trx })).get('blocked'));

        await UserController.unblock(evan, TS.ryan.id, trx);
        t.false((await UserController.build(ryan, evan, { show_blocked: true, trx })).get('blocked'));
    })
});
