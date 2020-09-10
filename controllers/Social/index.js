'use strict';

const config = require('../../config');

const ferror = require('../../lib/frescoerror');

const SocialLink = require('../../models/social_link');
const User = require('../../models/user');

class SocialController {

    /**
     *
     * @param data
     * @param data.platform
     * @param data.token
     * @param data.secret
     * @param trx
     * @returns {Promise}
     */
    connect({ platform, token, secret, jwt } = {}, { user, trx } = {}) {
        platform = platform[0].toUpperCase() + platform.slice(1);
        return module.exports[platform]
            .linkAccount({ token, secret, jwt }, { user, trx });
    }

    /**
     *
     * @param data
     * @param data.platform
     * @param data.social_account_id
     * @param trx
     * @returns {Promise}
     */
    disconnect({ platform } = {}, { user, trx } = {}) {
        platform = platform[0].toUpperCase() + platform.slice(1);
        return module.exports[platform]
            .unlinkAccount({ user, trx });
    }
}

module.exports = new SocialController;
module.exports.Facebook = require('./Facebook');
module.exports.Google = require('./Google');
module.exports.Twitter = require('./Twitter');
