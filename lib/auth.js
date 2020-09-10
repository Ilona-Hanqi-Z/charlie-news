'use strict';

const _ = require('lodash');
const BasicStrategy = require('passport-http').BasicStrategy;
const BearerStrategy = require('passport-http-bearer');
const ferror = require('./frescoerror');

const scope_part_wildcard = section => `(${section || '.*'})`;
const scope_delim = ':';

class Auth {

    constructor() {
        this.strategies = {
            basic: new BasicStrategy((clientID, clientSecret, done) => {
                if (!checkAlphaNum(clientID, clientSecret)) {
                    return done(ferror(ferror.UNAUTHORIZED));
                }

                AuthController.Client
                    .authenticate(clientID, clientSecret)
                    .then(client => done(null, client))
                    .catch(done);
            }),

            bearer: new BearerStrategy((t, done) => {
                if (!t) return done();
                if (!checkAlphaNum(t)) {
                    return done(ferror(ferror.UNAUTHORIZED));
                }


                AuthController.AccessToken
                    .resolve(t)
                    .then(token =>
                        (token)
                            ? done(null, token, { scopes: token.get('scopes') })
                            : done(null, false)
                    )
                    .catch(done);
            })
        };
    }

    /**
     * Convert the passed scopes to the corresponding regular expressions
     * 
     * @param scopes {String[]}
     * 
     * @returns {RegExp[]}
     */
    scopesToRegex(scopes = []) {
        let _scopes = {
            permitted: [],
            rejected: []
        };

        scopes.forEach(s => {
            let deny = false;
            if (s[0] === '!') {
                deny = true;
                s = s.substr(1);
            }
            (deny ? _scopes.rejected : _scopes.permitted).push(new RegExp(`^(${s.split(scope_delim).map(scope_part_wildcard).join(scope_delim)})$`));
        });

        return _scopes;
    }

    /**
     * Checks that the regex scopes passed permit the given permissions
     * 
     * LEGEND:
     *   sX = scopeX
     *   [s1, s2, s3] = s1 AND s2 AND s3
     *   [[s1, s2, s3]] = s1 OR s2 OR s3
     *   [[s1, [s2, s3]]] = s1 OR (s2 AND s3)
     * 
     * @param perms {String[]} permissions to check for
     * @param scopes {Object}
     * @param scopes.permitted {RegExp[]} regular expressions which must satisfy the permission required
     * @param scopes.rejected {RegExp[]} regular expressions, of which none should match the permission required
     * 
     * @returns {Boolean}
     */
    checkPermissions(perms = [], scopes) {
        let isAnd = true;
        if (_.isArray(perms)) {
            if (perms.length === 1 && _.isArray(perms[0])) {
                isAnd = false;
                perms = perms[0];
            }

            return perms[isAnd ? 'every' : 'some'](p => this.checkPermissions(p, scopes));
        } else {
            return this.checkPermission(perms, scopes);
        }
    }

    /**
     * Check that the given permission does not violate the given scopes
     * 
     * @param perm {String} format scope:noun:verb
     * @param scopes {Object}
     * @param scopes.permitted {RegExp[]} regular expressions which must satisfy the permission required
     * @param scopes.rejected {RegExp[]} regular expressions, of which none should match the permission required
     * 
     * @returns {Boolean}
     */
    checkPermission(perm = "", { permitted = [], rejected = [] } = {}) {
        perm = String(perm);

        // Add missing colons if necessary
        let missing_colons = 2 - perm.split(':').length;
        for (let i = missing_colons; i >= 0; --i) perm += ':';
        return permitted.some(s => s.test(perm)) && !rejected.some(s => s.test(perm));
    }
}

/**
 * Checks if the string(s) provided are alphanumeric
 * 
 * @param {string} args Any number of string arguments to test collectively
 * 
 * @returns {boolean}
 */
let alphanum_regex = /^[a-zA-Z0-9_]*$/;
function checkAlphaNum() {
    for (let str of arguments) {
        str = String(str);
        if (!alphanum_regex.test(str)) return false;
    }
    return true;
}

module.exports = new Auth;

const AuthController = require('../controllers/Auth');