'use strict';

const config = require('../config');

const ferror = require('../lib/frescoerror');

const AWS = require('aws-sdk');
const Promise = require('bluebird');

const S3 = new AWS.S3();

class TermsController {

    fetchTerms(user_model) {
        if (user_model && user_model.get('terms') === config.APPLICATION.TERMS.VERSION) {
            return Promise.resolve({
                valid: true,
                version: config.APPLICATION.TERMS.VERSION
            });
        }

        return new Promise((yes, no) => {
            S3.getObject({
                Bucket: config.AWS.S3.BUCKET,
                Key: config.APPLICATION.TERMS.KEY + config.APPLICATION.TERMS.VERSION
            }, (err, data) => {
                if (err) {
                    no(ferror.constraint(err));
                } else if (user_model) {
                    yes({
                        version: config.APPLICATION.TERMS.VERSION,
                        terms: data.Body.toString()
                    });
                } else {
                    yes({
                        valid: false,
                        version: config.APPLICATION.TERMS.VERSION,
                        terms: data.Body.toString()
                    });
                }
            })
        });
    }

    agreeToTerms(user_model, trx) {
        return user_model
            .save({
                terms: config.APPLICATION.TERMS.VERSION
            }, {
                patch: true,
                transacting: trx
            })
            .then(() => Promise.resolve({
                valid: true,
                version: config.APPLICATION.TERMS.VERSION
            }))
            .catch(err => Promise.reject(ferror.constraint(err)));
    }
}

module.exports = new TermsController;