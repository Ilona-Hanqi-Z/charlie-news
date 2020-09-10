'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Assignment Posts Check', async t => {
    const AssignmentController = require('../../../controllers/Assignment');

    // Farther than the radius of 1000m, but still inside the margin of error
    let assignments = await AssignmentController.checkPosts(null, {
        geo: {
            type: "MultiPoint",
            coordinates: [
                [
                    -120.36621093749999,
                    43.76
                ],
                [
                    -120.36621093749999,
                    43.77109381775651
                ]
            ]
        }
    });

    // Farther than the radius of 1000m, and outside the margin of error
    let no_assignments = await AssignmentController.checkPosts(null, {
        geo: {
            type: "MultiPoint",
            coordinates: [
                [
                    -120.36621093749999,
                    43
                ],
                [
                    -120.36621093749999,
                    43.77109381775651
                ]
            ]
        }
    });

    t.is(no_assignments.nearby.length, 0);
    t.is(assignments.nearby.length, 1);
    t.is(parseInt(assignments.nearby[0].get('id')), TS.assignment.oregon.id);
});