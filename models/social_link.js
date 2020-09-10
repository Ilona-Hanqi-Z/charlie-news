'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');
    
const COLUMNS = Columns(
    'user_id',
    'account_id',
    'platform'
);

module.exports = bookshelf.model('SocialLink', ...Base({
    tableName: 'social_links',
    idAttribute: null,

    user: function() { return this.belongsTo('User', 'user_id'); }
}, {
    COLUMNS: COLUMNS,
    FILTERS: {
        PUBLIC: COLUMNS.without('user_id')
    },
    SOURCES: {
        FACEBOOK: 'facebook',
        TWITTER: 'twitter',
        GOOGLE: 'google'
    },

    validPlatform: function (type) { return this.SOURCES.hasOwnProperty(type.toUpperCase()); }
}));