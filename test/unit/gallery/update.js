'use strict';

import test from 'ava';

import TestUtils from '../../helpers/TestUtils';
import TS from '../../helpers/TestSettings';

test.before(TestUtils.prepare);

test('Gallery Update - Highlight', async t => {
    const GalleryController = require('../../../controllers/Gallery');
    const user = await TestUtils.mockAdmin();

    // set highlighted_at a day in the past to avoid issues with time differences between db and server during tests
    let highlighted_date = new Date();
    highlighted_date.setDate(highlighted_date.getDate() - 1);

    return TestUtils.rollback(async trx => {
        let gallery = await GalleryController.update(user, TS.gallery.id, {
            rating: 3,
            highlighted_at: highlighted_date
        }, trx);

        t.is(gallery.get('rating'), 3);

        let highlights = await GalleryController.highlights({}, { user, trx });
        t.is(parseInt(highlights[0].get('id')), TS.gallery.id);
    });
});