'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
    
const COLUMNS = Columns(
    'id',
    'title',
    'caption',
    'job_id',
    'image',
    'video',
    'stream',
    'tags',
    'created_at',
    'updated_at',
    'status',
    'rating'
);

module.exports = bookshelf.model('Recap', ...Base({
    tableName: 'recaps',
    objectName: 'recap',
    
    stories: function() { return this.belongsToMany('Story', 'recap_stories', 'recap_id', 'story_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('job_id')
    },
    QUERIES: {
        VISIBLE: function(qb) {
            return qb.where('recaps.status', this.STATUS.COMPLETE);
        }
    },
    STATUS: {
        FAILED: -1,
        PENDING: 0,
        PROCESSING: 1,
        COMPLETE: 2
    }
}));