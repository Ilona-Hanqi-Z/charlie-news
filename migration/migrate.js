'use strict';

// This script will update the database from one version to another

const config = require('../config');
require('shelljs/global');

function migrate() {
    const knex = require('knex')(config.DB);
    return knex
        .select('version')
        .from('db_version')
        .then(rows => {
            const current_version = rows[0].version; // Get the db's current version

            const migration_files = ls('./migrations');

            let migrations = { target_version: 0 };

            // Loop through all of the migration files, adding them all to an object and keeping track of the largest one
            for (const migration_file of migration_files) {
                let version = parseInt(migration_file.split('.')[0]);

                // Skip files that aren't a number
                if (isNaN(version)) {
                    console.log(`Migration file ${migration_file} isn't a number, skipping`);
                    continue;
                }

                if (version > migrations.target_version) migrations.target_version = version;

                migrations[version] = migration_file;
            }

            console.log(`Current DB Version: ${current_version}`);
            console.log(`Target DB Version: ${migrations.target_version}`);

            // Run all of the migrations from the current db version to the target
            for (let i = current_version + 1; i <= migrations.target_version; i++) {
                const migration = migrations[i];

                // If the version doesn't exist (i.e. going from v1 to v3, and not 2.sql exists) ignore it
                if (!migration) {
                    console.log(`Migration to version ${i} doesn't exist, skipping`);
                    continue;
                }

                console.log(`Running migration: ${migration}`);

                // Run the migration files through psql, so that they can reference other files if needed
                const psql_command = `PGPASSWORD=${config.DB.connection.password} psql -v ON_ERROR_STOP=1 -U ${config.DB.connection.user} ` +
                    `-d ${config.DB.connection.database} -h ${config.DB.connection.host} -p ${config.DB.connection.port}` +
                    ` -f ./migrations/${migration} --single-transaction`;

                // If any of the migrations fail, the whole command fails
                let result = exec(psql_command);
                if (result.code) {
                    console.error(`Error running migration ${migration}`);
                    process.exit(result.code);
                }
            }

            process.exit(0);
        });
}

// Run the migration against the correct environment by loading the right config file
const environment = process.argv[2];

if (!environment) {
    console.error(`Please provide a valid environment`);
    process.exit(2);
}

if (environment === 'test') {
    config.buildTest().then(migrate);
}
else if (environment === 'dev') {
    config.build().then(migrate);
}
else if (environment === 'prod') {
    process.env.FRESCO_CONFIG = '../config/prod/';
    config.build().then(migrate);
}
else {
    console.error(`Invalid environment: ${environment}. Valid environments are test, dev, prod`);
    process.exit(1);
}