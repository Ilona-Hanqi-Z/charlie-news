 ## The Fresco API

This repo houses the API and backend that drive all of the Fresco clients. It's written in javascript (node) and uses the [`express`](https://github.com/expressjs/express) framework. It interfaces with a [`postgres`](https://www.postgresql.org/) database using [`bookshelf`](http://bookshelfjs.org/) and [`knex`](http://knexjs.org/). We also interact with a custom [`scheduling server`](https://github.com/miketerpak/scheduler) for handling delayed events and notifications.

Refer to the Fresco [`Javascript`](https://github.com/fresconews/fresco-style/tree/master/javascript) style guide for proper coding and commenting practices.

#### Configuration

Configuration is done mostly by json. By default, the server uses the file `./config/dev.json`, however this can be overridden by setting the `FRESCO_CONFIG` environment variable and pointing to a different file.

In addition, AWS needs to be configured, either by environment variables or by placing a credentials file in `~/.aws/credentials`. See [here](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more details

#### Running

1. Clone repo
2. `npm install` to install dependencies
3. Make any changes to configuration (database url, ports, etc) you want
4. `npm start`

Warnings about not being able to connect to redis can be ignored if you aren't using the rate-limiter.

#### Docker

We use [`Docker`](https://www.docker.com/) images for isolating our unit and integration tests. The containers can be built and linked by running the `test/_start_test_env.js` script. The script also takes care of configuring the tests to point to the correct containers. Everything can be torn down with the `test/_stop_test_env.js`

**Note:**  The script needs to be run from a terminal with Docker setup. If you have Windows 10 Pro or linux, any terminal will work (assuming Docker is installed). Otherwise, you will need to use the Docker Toolbox and Kitematic, which can create a VM that the containers will be run on.

#### Tests

Once the containers are set up, the tests can be run by using `npm test`. We use [`ava`](https://github.com/avajs/ava) as our test runner, for the `async/await` goodness and parallel execution. Tests are split into unit and integration tests, and can be run individually using `ava test/unit` or `ava test/integration`.
