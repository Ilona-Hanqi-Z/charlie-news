'use strict'

const config = require('../config')
const Hashids = require('hashids')

const hashids = new Hashids(config.SECRETS.ID_SALT, 12, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')

module.exports = {
    decode: hash => hashids.decode(hash)[0],
    decodeMany: hashes => hashids.decode(hashes),
    encode: val => hashids.encode(val)
}