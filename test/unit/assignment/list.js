'use strict';

import test from 'ava';
import _ from 'lodash';

import TestUtils from '../../helpers/TestUtils';

test.before(TestUtils.prepare);

test('Assignment List - rating', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    const Assignment = require('../../../models/assignment');
    let assignments = await AssignmentController.list(null, { rating: Assignment.RATING.APPROVED });
    t.true(_.every(assignments, assignment => assignment.get('rating') === Assignment.RATING.APPROVED));
});

test('Assignment List - geo within', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    // point should be within 3.5km of assignment 35
    let has_assignments = await AssignmentController.list(null, {
        radius: 3500,
        where: 'within',
        geo: {
            "type": "Point",
            "coordinates": [
                -120.41976928710938,
                43.7715896488274
            ]
        }
    });
    // point should not be within 3km of any assignments
    let no_assignments = await AssignmentController.list(null, {
        radius: 3000,
        where: 'within',
        geo: {
            "type": "Point",
            "coordinates": [
                -120.41976928710938,
                43.7715896488274
            ]
        }
    });

    t.is(no_assignments.length, 0);
    t.is(has_assignments.length, 1);
    t.is(has_assignments[0].get('id'), '35');
});

test('Assignment List - geo intersects', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    // line query should collide with assignment 35
    let has_assignments = await AssignmentController.list(null, {
        where: 'intersects',
        geo: {
        "type": "LineString",
        "coordinates": [
          [
            -120.37685394287111,
            43.777322397038205
          ],
          [
            -120.37045955657959,
            43.77911957791513
          ]
        ]
      }
    });
    // line query should not collide with any assignment
    let no_assignments = await AssignmentController.list(null, {
        where: 'intersects',
        geo: {
        "type": "LineString",
        "coordinates": [
          [
            -120.37865102291106,
            43.77074905779224
          ],
          [
            -120.37869662046431,
            43.7715412280055
          ],
          [
            -120.37860810756683,
            43.77233919814999
          ],
          [
            -120.37944227457047,
            43.77223073681385
          ]
        ]
      }
    });
    // 2nd line query should collide with assignment 35 with a buffered radius of 50m
    let radial_has_assignments = await AssignmentController.list(null, {
        where: 'intersects',
        radius: 50,
        geo: {
        "type": "LineString",
        "coordinates": [
          [
            -120.37865102291106,
            43.77074905779224
          ],
          [
            -120.37869662046431,
            43.7715412280055
          ],
          [
            -120.37860810756683,
            43.77233919814999
          ],
          [
            -120.37944227457047,
            43.77223073681385
          ]
        ]
      }
    });

    t.is(no_assignments.length, 0);
    t.is(has_assignments.length, 1);
    t.is(has_assignments[0].get('id'), '35');
    t.is(radial_has_assignments.length, 1);
    t.is(radial_has_assignments[0].get('id'), '35');
});

test('Assignment List - geo contained', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    // assignment 35 should contain the given query
    let has_assignments = await AssignmentController.list(null, {
        where: 'contained',
        geo: {
            "type": "Polygon",
            "coordinates": [
                [
                    [
                        -120.37303447723389,
                        43.771496680814735
                    ],
                    [
                        -120.36415100097655,
                        43.771496680814735
                    ],
                    [
                        -120.36415100097655,
                        43.77819000834361
                    ],
                    [
                        -120.37303447723389,
                        43.77819000834361
                    ],
                    [
                        -120.37303447723389,
                        43.771496680814735
                    ]
                ]
            ]
        }
    });
    // no assignments should contain the previous query when buffered by 100m
    let no_assignments = await AssignmentController.list(null, {
        where: 'contained',
        radius: 100,
        geo: {
            "type": "Polygon",
            "coordinates": [
                [
                    [
                        -120.37303447723389,
                        43.771496680814735
                    ],
                    [
                        -120.36415100097655,
                        43.771496680814735
                    ],
                    [
                        -120.36415100097655,
                        43.77819000834361
                    ],
                    [
                        -120.37303447723389,
                        43.77819000834361
                    ],
                    [
                        -120.37303447723389,
                        43.771496680814735
                    ]
                ]
            ]
        }
    });

    t.is(no_assignments.length, 0);
    t.is(has_assignments.length, 1);
    t.is(has_assignments[0].get('id'), '35');
});

test('Assignment List - geo contains', async t => {
    const AssignmentController = require('../../../controllers/Assignment');
    // assignment 35 should be contained by the given query
    let has_assignments = await AssignmentController.list(null, {
        where: 'contains',
        radius: 500,
        geo: {
            "type": "Polygon",
            "coordinates": [
                [
                    [
                        -120.3658676147461,
                        43.77961534244412
                    ],
                    [
                        -120.3773260116577,
                        43.773325025204
                    ],
                    [
                        -120.37294864654541,
                        43.76439969596846
                    ],
                    [
                        -120.35857200622559,
                        43.764740618423275
                    ],
                    [
                        -120.35556793212889,
                        43.77394479027776
                    ],
                    [
                        -120.3658676147461,
                        43.77961534244412
                    ]
                ]
            ]
        }
    });
    // no assignments should contain the previous query when buffered by 100m
    let no_assignments = await AssignmentController.list(null, {
        where: 'contains',
        geo: {
            "type": "Polygon",
            "coordinates": [
                [
                    [
                        -120.3658676147461,
                        43.77961534244412
                    ],
                    [
                        -120.3773260116577,
                        43.773325025204
                    ],
                    [
                        -120.37294864654541,
                        43.76439969596846
                    ],
                    [
                        -120.35857200622559,
                        43.764740618423275
                    ],
                    [
                        -120.35556793212889,
                        43.77394479027776
                    ],
                    [
                        -120.3658676147461,
                        43.77961534244412
                    ]
                ]
            ]
        }
    });

    t.is(no_assignments.length, 0);
    t.is(has_assignments.length, 1);
    t.is(has_assignments[0].get('id'), '35');
});