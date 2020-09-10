'use strict';

const _ = require('lodash');
const bookshelf = require('../lib/bookshelf')
const hashids = require('../lib/hashids');
const blacklist = ['client_id', 'external_id', 'external_account_id', 'twitter_id', 'facebook_id', 'parse_id', 'job_id', 'stripe_account_id'];
const whitelist = [
    'outlets_add',
    'outlets_remove',
    'galleries_add',
    'galleries_remove',
    'posts_add',
    'posts_remove',
    'articles_add',
    'articles_remove',
    'stories_add',
    'stories_remove',
    'reposted_by',
    'exclusive_to'
];

/**
 * Recursively encode all ids contained within the object if the
 * object keys follow the id/ids model ID naming scheme
 * 
 * @param obj {Any}
 * @param encode {Boolean} optional, should IDs be encoded (true) or decoded (false)
 */
function processIds(obj, encode = true) {
    if (!obj) return
    if (_.isArray(obj)) return obj.forEach(o => processIds(o, encode))
    if (!_.isObject(obj) || _.isDate(obj)) return
    
    let func = encode ? 'encode' : 'decode'

    for (let key in obj) {
        if (
            obj[key] === obj // self-references
            || obj[key] == null // ignore null/undefined
            || (obj.hasOwnProperty && !obj.hasOwnProperty(key))
            || _.isFunction(obj[key])
            || _.isDate(obj[key])
        ) continue
        if (_.isArray(obj[key])) {
            if (whitelist.includes(key)
                || (
                    (key === 'ids' || key.substr(-4) === '_ids')
                    && !blacklist.includes(key)
                )) {
                obj[key] = obj[key].map(hashids[func])
            } else {
                obj[key] = obj[key].map(o => {
                    if (typeof o.toJSON === 'function') {
                        o = o.toJSON()
                    }
                    processIds(o, encode)
                    return o
                })
            }
        } else if (_.isObject(obj[key])) {
            if (typeof obj[key].toJSON === 'function') {
                obj[key] = obj[key].toJSON()
            }
            processIds(obj[key], encode)
        } else if ((whitelist.includes(key) || key === 'id' || key.substr(-3) === '_id') && !blacklist.includes(key)) {
            obj[key] = hashids[func](obj[key])
        }
    }
}

module.exports = (req, res, next) => { // middleware
    if (_.isObject(req.params)) {
        for (let i in req.params) {
            if (
                (
                    i === 'ids'
                    || (
                        !blacklist.includes(i)
                        && i.substr(-4) === '_ids'
                    )
                )
                && typeof req.params[i] === 'string'
            ) {
                req.params[i] = req.params[i].split(',')
            }
        }
    }

    processIds(req.query, false)
    processIds(req.params, false)
    processIds(req.body, false)

    // Mark the response as unhashed (necessary because OAuth2orize uses `res.end` instead of `res.send`, bypassing normal hashing)
    res.locals.__ids_hashed = false
    // Hook into the send function to encode outgoing IDs
    let res_send = res.send.bind(res)
    res.send = function(obj) {
        if (res.locals.__ids_hashed) {
            return res_send(obj);
        } else if (obj && typeof obj.toJSON === 'function') {
            obj = obj.toJSON()
        } else if (_.isArray(obj)) {
            obj = obj.map(o => {
                if (o == null) return null
                else if (typeof o.toJSON === 'function') return o.toJSON()
                else return o
            })
        }

        res.locals.__ids_hashed = true
        processIds(obj, true)
        res_send(obj)
    }
    
    // Ensure the data has been hashed before sending
    // This is necessary because the OAuth2orize server incorrectly responds
    // directly via res.end, instead of using res.send.
    let res_end = res.end.bind(res);
    res.end = function(obj) {
        if (res.locals.__ids_hashed) {
            return res_end(obj)
        }
        // Set flag
        res.locals.__ids_hashed = true

        let _obj = null
        try {
            _obj = JSON.parse(obj.toString())
        } catch(e) {
            // Do nothing, return raw string if not JSON
        }

        if (_obj === null) {
            res_end(obj)
        } else {
            processIds(_obj, true)
            res_end(JSON.stringify(_obj))
        }
    }

    next()
}