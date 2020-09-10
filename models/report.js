'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'user_id',
    'reason',
    'message',
    'created_at',
    'status'
);

const Report = module.exports = bookshelf.model('Report', ...Base({
    tableName: 'reports',

    user: function() { return this.belongsTo('User', 'user_id'); },
    reported_gallery: function() { return this.belongsToMany('Gallery', 'gallery_reports', 'report_id', 'gallery_id'); },
    reported_user: function() { return this.belongsToMany('User', 'user_reports', 'report_id', 'user_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS
    },
    QUERIES: {
        VISIBLE: (qb) => {
            return qb.where('reports.status', Report.STATUS.NOT_SEEN);
        }
    },
    STATUS: {
        SKIPPED: -1,
        NOT_SEEN: 0,
        ACTED: 1
    }
}));