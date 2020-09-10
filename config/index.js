'use strict';

const configurator = require('nconfigurator');
const path = require('path');

const AutoFollowProvider = require('./AutoFollowProvider');
const AutoVerifyProvider = require('./AutoVerifyProvider');

var config = {
    /**
     * Build the config file, taking into account the current environment
     */
    build: function() {
        configurator.use('literal', { FRESCO_CONFIG: path.join(__dirname, './dev')});
        configurator.use('env', { whitelist: ['FRESCO_CONFIG'] });
        configurator.use('file', { fromConfig: 'FRESCO_CONFIG' });
        configurator.use(new AutoFollowProvider());
        configurator.use(new AutoVerifyProvider());
        configurator.use('cli');

        return configurator
            .build()
            .then(conf => {
                return configurator.utils.merge(this, conf);
            });
    },

    createTest: function() {
        configurator.use('file', { file: path.join(__dirname, './dev') });
        configurator.use('file', { file: path.join(__dirname, '../test/helpers/config/overrides') });

        return configurator
            .build()
            .then(conf => {
                return configurator.utils.merge(this, conf);
            });
    },

    buildTest: function() {
        configurator.use('file', { file: path.join(__dirname, 'test.json') });
        return configurator
            .build()
            .then(conf => {
                return configurator.utils.merge(this, conf);
            })
    }
};

module.exports = config;
