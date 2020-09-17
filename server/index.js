#!/usr/bin/env node

const cluster = require('cluster');
const config = require('../config');

const num_of_cpus = require('os').cpus().length;

config
    .build()
    .then(() => {
        if (config.SERVER.ENV === 'production' && cluster.isMaster) {
            for (let i = num_of_cpus - 1; i >= 0; --i) {
                cluster.fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                console.error(`Worker ${worker.process.pid} died!`);
                cluster.fork();
            });
        } else {
            init();
        }
    })
    .catch(console.error);

// NOTE init.js must be required AFTER the config loads
function init() {
    //let func = require('./init');
    //func().then(start).catch(console.error);
    start();
}

function start() {
    const app = require('../Fresco.js');
    const http = require('http');

    const port = normalizePort(process.env.PORT || config.SERVER.PORT);
    app.set('port', port);

    const server = http.createServer(app);

    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);

    function normalizePort(val) {
        var port = parseInt(val, 10);
        if (isNaN(port)) return val;
        if (port >= 0) return port;
        return false;
    }

    function onError(error) {
        if (error.syscall !== 'listen') {
            throw error;
        }

        let bind = typeof port === 'string'
            ? 'Pipe ' + port
            : 'Port ' + port;

        switch (error.code) {
            case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
            case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
            default:
            throw error;
        }
    }

    function onListening() {
        let addr = server.address();
        let bind = typeof addr === 'string'
            ? 'pipe ' + addr
            : 'port ' + addr.port;
        console.log(`[ ${(new Date()).toLocaleString()} ] Listening on ${bind}`);
    }
}
