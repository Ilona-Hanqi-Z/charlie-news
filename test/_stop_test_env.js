'use strict';

// This script tears down the test environment, removing any resources it created

require('shelljs/global');

// Preform all actions in the context of the project root
cd('../');

echo('Stopping and removing containers');
exec(`docker-compose down`, { silent: true });

echo('Removing db volume');
exec(`docker volume rm fresco_db_volume`, { silent: true });

echo('Removing config files');
rm('./config/test.json');
rm('./aws_creds');