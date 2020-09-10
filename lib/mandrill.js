'use strict';

const
      config = require('../config'),
      mandrill = require('mandrill-api/mandrill'),
      mandrill_client = new mandrill.Mandrill(config.MANDRILL.API_KEY);

module.exports = mandrill_client;