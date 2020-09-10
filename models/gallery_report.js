'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'gallery_id',
    'report_id'
);

module.exports = bookshelf.model('GalleryReport', ...Base({
    tableName: 'gallery_reports',
    idAttribute: null,

    report: function() { return this.belongsTo('Report', 'report_id'); },
    gallery: function() { return this.belongsTo('Gallery', 'gallery_id'); }
}, {
    COLUMNS: COLUMNS
}));