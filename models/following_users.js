'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'user_id',
    'other_id',
    'active',
    'action_at'
);

module.exports = bookshelf.model('FollowingUsers', ...Base({
    tableName: 'following_users',

    otherUser: function() { return this.belongsTo('User', 'other_id'); }
}, {
    COLUMNS: COLUMNS
}));