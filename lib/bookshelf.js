'use strict';

const config = require('../config');
const knex = require('knex')(config.DB);
const bookshelf = require('bookshelf')(knex);

bookshelf.plugin('registry');

module.exports = bookshelf;