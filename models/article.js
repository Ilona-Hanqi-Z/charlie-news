'use strict';

const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'title',
    'outlet_id',
    'link',
    'favicon',
    'created_at'
);

module.exports = bookshelf.model('Article', ...Base({
    tableName: 'articles',
    objectName: 'article',

    outlet: function() { return this.belongsTo('Outlet'); },
    galleries: function() { return this.belongsToMany('Gallery', 'gallery_articles', 'article_id', 'gallery_id'); },
    stories: function() { return this.belongsToMany('Story', 'story_articles', 'article_id', 'story_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.with('id', 'title', 'favicon', 'link', 'created_at')
    }
}));