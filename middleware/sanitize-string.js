'use strict';

const sanitizer = require('sanitizer');

module.exports = (req, res, next) => {

    if (req.body && !req.get('Content-Type') == 'text/plain') {
        for (let index in req.body) {
            if (typeof req.body[index] === 'string') {
                req.body[index] = sanitizer.sanitize(req.body[index]);
            }
        }
    } else if (req.query) {
        for (let index in req.query) {
            if (typeof req.query[index] === 'string') {
                req.query[index] = sanitizer.sanitize(req.query[index]);
            }
        }
    }
    
    next();
};