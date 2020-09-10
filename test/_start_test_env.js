'use strict';

// This script sets up the environment for local testing. It brings up the a set of docker containers, including the api
// and a database already populated with test data. It also generates a set of configuration files that point everything
// to the correct resources.

const config = require('../config');
const fs = require('fs');
const Knex = require('knex');
require('shelljs/global');

// If we're running this from circleci, just generate the config. circle ci will do the rest
if (process.argv.includes('circleci')) {
    buildConfig('localhost', true);
}
else {
    // Delete any previous test data
    exec('node ./_stop_test_env.js');

    findDockerHost();
}

// If the computer supports docker natively, then run using localhost. Otherwise, query docker machine to find the ip of
// the VM running docker
function findDockerHost() {
    echo('Finding docker host');

    let dockerMachineStatus = exec(`docker-machine status`, { silent: false }).stdout.trim();

    if (dockerMachineStatus !== 'Running') {
        buildConfig('localhost');
    }
    else {
        let ip = exec(`docker-machine ip`, { silent: false }).stdout.trim();
        buildConfig(ip);
    }
}

// Build the test configuration, with the given host
function buildConfig(host, only_config = false) {
    cd('../'); // Perform all actions from the project root
    echo('Writing config files');
    config
        .createTest()
        .then(config => {
            config.DB.connection.host = host;
            config.SERVER.API_HOST = host;

            fs.writeFileSync('./config/test.json', JSON.stringify(config, null, 4));

            if (!only_config) {
                buildDBContainer(config.DB);
            }
        });
}

// Create a volume for the database containing the test data
function buildDBContainer(knexConfig) {
    echo('Building test database container');

    exec(`docker build -t fresco_db ./sql/`, { silent: false });
    let containerId = exec(`docker run -d -v fresco_db_volume:/var/lib/postgresql/data -p 5432:5432 --env POSTGRES_DB=circle_test --env POSTGRES_USER=ubuntu fresco_db`, { silent: false }).stdout;
    echo('Waiting for container to initialize testing data...');
    checkDBProgress(knexConfig, containerId);
}

// Wait until all of the test data has been added to the database
function checkDBProgress(knexConfig, tempContainerId, maxTries = 10, __tries = 1) {
    const knex = Knex(knexConfig);
    knex('status')
        .count().as('count')
        .then(result => {
            if (result.length === 0 || result[0].count === 0) {
                // setup not finished, retry or abort
                if (__tries >= maxTries) {
                    fail('Unable to connect to DB container', tempContainerId);
                } else {
                    setTimeout(() => checkDBProgress(knexConfig, tempContainerId, maxTries, ++__tries), 1000 + (500 * __tries));
                }
            } else {
                launchContainers(tempContainerId);
            }
        })
        .catch(err => {
            if (__tries < maxTries && err.message === 'Pool was destroyed') {
                return setTimeout(() => checkDBProgress(knexConfig, tempContainerId, maxTries, ++__tries), 500 * __tries);
            } else {
                fail('Unable to connect to DB container', tempContainerId);
            }
        });
}

// Actually launch the containers
function launchContainers(tempContainerId) {
    if (tempContainerId) {
        echo('Removing temporary DB instance');
        exec(`docker stop ${tempContainerId}`, { silent: false });
        exec(`docker rm ${tempContainerId}`, { silent: false });
    }

    echo('Copying AWS creds');

    // Copy local AWS credentials for the integration tests, so we don't have to store them in the repo
    let homeDir = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    cp(`${homeDir}/.aws/credentials`, './aws_creds');

    echo('Building API container');
    exec(`docker-compose build`);

    echo('Starting api and db');
    exec(`docker-compose up`, { async: true });

    done();
}

function done() {
    echo('Done');
}

function fail(err, containerIdToRemove) {
    if (containerIdToRemove) {
        exec(`docker rm ${containerIdToRemove} -f`, { silent: false });
    }

    console.error(err);
}