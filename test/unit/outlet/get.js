'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Outlet Get', async t => {
    const OutletController = require('../../../controllers/Outlet');
    let user = await TestUtils.mockAdmin();

    let outlet = await OutletController.get(user, TS.outlet.id);

    t.is(outlet.get('title'), TS.outlet.title);
    t.is(outlet.get('goal'), TS.outlet.goal);
});