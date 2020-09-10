'use strict';

const ferror = require('../lib/frescoerror');

module.exports = (req, res, next) => {
    next(ferror(ferror.NOT_FOUND).msg('Endpoint not found'));
};