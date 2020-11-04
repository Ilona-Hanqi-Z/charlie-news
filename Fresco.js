'use strict';

const api_bridge = require('./lib/api-bridge');
const bodyParser = require('body-parser');
const config = require('./config');
const express = require('express');
const favicon = require('serve-favicon');
const fs = require('fs');
const middleware = require('./middleware');
const path = require('path');
const redisClient = require('./lib/redis').client;
const routes = require('./routes');
const winston = require('./lib/winston');
var cors = require('cors')

const app = express();
app.use(cors());
app.set('env', config.SERVER.ENV);
app.set('etag', false);

app.use(middleware.raven.requestHandler());

app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(middleware.rateLimiter);
app.use(middleware.winston);
app.use(express.static(path.join(__dirname, 'public')));


// // TODO TEMP, REMOVE THIS AFTER CLIENTLESS REQUESTS ARE PHASED OUT
app.use((req, res, next) => {
    if (!req.headers['authorization'] && req.path.substr(0, 12) !== '/v2/webhook/') {
        req.headers['authorization'] = 'Basic dGVtcF9pd3FleXJ1aXF3ZXVyb2lxd2lleXJ1aW9xd3l1b2lyeXVxd2lleXJvdWl3ZXF5dWk6dW15Zzg0dHdtaGlsdXJ0ZWhndWxpNDVobXZ2Z3V3NGNpOG12dGhnZWl1NG9oZ283OHVlNDVo';
    }

    next();
});

app.use(bodyParser.text());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Ensures that any body provided is a valid JSON object (i.e. not a string)
app.use((req, res, next) => {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        } catch (e) {
            let err = new SyntaxError('Invalid request body');
            err.statusCode = 400;
            return next(err);
        }
    }

    next();
});

app.use(middleware.auth.passport);

app.use(middleware.archiveRequest);
app.use(middleware.sanitizeString);
app.use(middleware.noCache);

app.use(api_bridge.middleware());

// Routes
app.use('/', routes.default);
app.use('/v2', routes.v2);
// 404 Handler
app.use(middleware.notFoundHandler);

// Error Handler
app.use(middleware.raven.errorHandler(config.SERVER.ENV));
app.use(api_bridge.errorHandler());

module.exports = app;