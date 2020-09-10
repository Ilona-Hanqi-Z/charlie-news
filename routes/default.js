'use strict';

const config = require('../config');

const _ = require('lodash');
const express = require('express');
const superagent = require('superagent');

const middleware = require('../middleware');
const ferror = require('../lib/frescoerror')
const hashIds = require('../lib/hashids');

const app = express();
const router = express.Router();

/**
 * ** NOTE ** NOTE ** NOTE ** NOTE ** NOTE ** NOTE ** NOTE ** NOTE **
 * Write your testing routes within this statement. Code/routes in
 * here will not be implemented on production servers.
 */
if (config.SERVER.ENV !== 'production') {
    router.get('/codec/:id', (req, res) => {
        res.send({
            decode: hashIds.decode(req.params.id),
            encode: hashIds.encode(parseInt(req.params.id, 10))
        });
    });
}

router.all('/v1/webhook/alert', (req,res,next) => {
    const fromNumber = req.query.From || req.body.From;
    const bodyText = req.query.Text || req.body.Text;
    
    // if (fromNumber !== config.SLACK.ALERT_NUMBER){
    //     return res.status(401).end();
    // }
    
    const payload = `*INCOMING ALERT*: ${bodyText}`;

    superagent
        .post(config.SLACK.WEBHOOK)
        .send({
            channel: config.SLACK.CHANNELS.POLICE_SCANNER,
            username: 'The Scanman',
            text: payload
        })
        .end((err, response)=>{
            res.status(200).send();
        });
});

module.exports = router;