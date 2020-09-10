'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';

test.before(TestUtils.prepare);

test('Assignment Create', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    return TestUtils.rollback(async trx => {
        let user = await TestUtils.mockAdmin();

        let created = await AssignmentController.create(user, {
            address: '12 Main Street',
            title: 'This is a title',
            caption: 'this is a caption',
            location: {"type":"Point","coordinates":[77.00905,38.889939]},
            starts_at: new Date(),
            ends_at: new Date()
        }, trx);

        let gotten = await AssignmentController.get(null, created.get('id'), trx);

        t.is(created.get('id'), gotten.get('id'));
    });
});
