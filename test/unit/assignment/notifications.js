'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Assignment Notifications', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    let users = await AssignmentController.getUsers(TS.assignment.elevator.id);
    let user_ids = users.map(u => parseInt(u.get('id')));
    t.true(user_ids.includes(TS.ryan.id));
    t.false(user_ids.includes(TS.evan.id));
});