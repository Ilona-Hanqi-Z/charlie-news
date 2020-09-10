'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Assignment Update', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    return TestUtils.rollback(async trx => {
        let user = await TestUtils.mockAdmin();

        let caption = 'Hello World';
        let assignment_id = TS.assignment.elevator.id;

        await AssignmentController.update(
            assignment_id,
            { caption },
            { trx, user }
        );

        let gotten = await AssignmentController.get(null, assignment_id, trx);

        t.is(gotten.get('caption'), caption);
    })
});