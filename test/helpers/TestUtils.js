'use strict';

const fs = require('fs');

const config = require('../../config');
const TS = require('./TestSettings');

const supertest = require('supertest');

let request;

class TestUtils {
    static prepare() {
        return config.buildTest();
    }

    static supertest() {
        if (!request) {
            let address = `http://${config.SERVER.API_HOST}:4040/v2/`;
            request = supertest(address);
        }
        return request;
    }

    static rollback(transactionCallback) {
        const bookshelf = require('../../lib/bookshelf');
        return bookshelf
            .transaction(trx => {
                transactionCallback(trx)
                    .then(trx.rollback)
                    .catch(trx.rollback);
            })
            .catch(ex => {
                //noinspection EqualityComparisonWithCoercionJS
                if (ex == null) {
                    return;
                }
                throw ex;
            });

    }

    static mockAdmin() {
        const UserController = require('../../controllers/User');

        return UserController
            .login(TS.ryan.username, TS.ryan.password)
            .then(user => {
                //noinspection JSUnusedGlobalSymbols
                user.can = (s, v, n) => true;
                return user;
            });
    }
}

module.exports = TestUtils;