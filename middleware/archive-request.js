const _ = require('lodash');
module.exports = (req, res, next) => {
    req.__body = _.cloneDeep(req.body);
    req.__query = _.cloneDeep(req.query);
    req.__params = _.cloneDeep(req.params);

    // If a password was sent, censor it
    if (req.__body.password) req.__body.password = '************';

    // Passwords should NEVER be sent over GET or through the URL.
    // In case someone does do this, censor the password
    if (req.__query.password) req.__query.password = '************';
    if (req.__params.password) req.__params.password = '************';

    next();
};