'use strict';

const _ = require('lodash');
const Base = require('./base');
const bookshelf = require('../lib/bookshelf');
const Columns = require('../lib/columns');

const COLUMNS = Columns(
    'id',
    'type'
);

module.exports = bookshelf.model('NotificationType', ...Base({
    tableName: 'notification_types'
}, {
    COLUMNS
}));