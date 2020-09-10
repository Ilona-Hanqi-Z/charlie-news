'use strict'

const bookshelf = require('../lib/bookshelf');
const winston = require('../lib/winston');

module.exports = (req, res, next) => {
    bookshelf.transaction(trx => {

        let transaction_id = Math.random().toString(36).substring(16);

        trx._commit = trx.commit;
        trx.commit = () => {
            winston.info('Transaction Commit: ' + transaction_id);
            trx._commit();
        };
        res.locals.trx = trx;
        res.locals.trx.additional_rollbacks = [];
        res.locals.trx.transaction_id = transaction_id;

        winston.info('Transaction Start: ' + transaction_id + ' ' + req.url);
        next()
    }).then()
};