'use strict';

const ferror = require('../lib/frescoerror');
const needs = require('../lib/needs');
const raven = require('../lib/raven');
const winston = require('../lib/winston');

const errorHandler = raven.errorHandler();

module.exports.requestHandler = () => raven.requestHandler();
module.exports.errorHandler = function(env = 'production') {
    return [
        (err, req, res, next) => {
            if (res.locals.trx) {
                winston.info('Transaction Rollback: ' + res.locals.trx.transaction_id);
                res.locals.trx.rollback();
                for (let rb of res.locals.trx.additional_rollbacks) {
                    if (typeof rb === 'function') {
                        rb().catch(err => {
                            raven.captureException(err);
                        });
                    } else {
                        throw new Error('Non-function passed to transaction.additional_rollbacks')
                    }
                }
            }

            if (err instanceof needs.error) {
                err = ferror(err).type(ferror.INVALID_REQUEST);
            } else if (err instanceof SyntaxError && err.statusCode === 400) {
                err = ferror(ferror.INVALID_REQUEST).msg('Improperly formatted request body. Request bodies must be urlencoded or valid JSON. If this error persists, check the content type of the request.');
            } else if (!err._fresco) {
                err = ferror(err).type(ferror.API);
            }

            if (Object.keys(req.__body || {}).length) {
                winston.info('Request body:');
                winston.info(JSON.stringify(req.__body));
            }
            if (Object.keys(req.__query || {}).length) {
                winston.info('Request querystring:');
                winston.info(JSON.stringify(req.__query));
            }
            if (Object.keys(req.__params || {}).length) {
                winston.info('Request URL params:');
                winston.info(JSON.stringify(req.__params));
            }
            if (Object.keys(req.__headers || {}).length) {
                winston.info('Request URL headers:');
                winston.info(JSON.stringify(req.__headers));
            }

            if (err.status() >= 500) {
                console.error(err.trace());
                errorHandler(err, req, res, next);
            } else {
                next(err);
            }
        },
        (err, req, res, next) => {
            res.status(err.status() || 500);
            next({ error: err.res(env !== 'production') });
        }
    ];
};