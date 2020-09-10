'use strict'

import test from 'ava'
import * as Promise from 'bluebird'

import * as fs from 'fs'

const CONFIG_DIR = '../../../config/'

Promise.promisifyAll(fs)

test('Configuration files should have the same structure', async t => {
    let devDir = CONFIG_DIR + 'dev/'
    let prodDir = CONFIG_DIR + 'prod/'
    let devFiles = await fs.readdirAsync(devDir)
    let prodFiles = await fs.readdirAsync(prodDir)

    t.true(devFiles.length === prodFiles.length)

    for (let filename of devFiles) {
        let devData = await fs.readFileAsync(devDir + filename)
        let prodData = await fs.readFileAsync(prodDir + filename)

        try {
            devData = JSON.parse(devData)
        } catch(e) {
            t.fail('JSON Syntax error in file: dev/' + filename)
            break
        }

        try {
            prodData = JSON.parse(prodData)
        } catch(e) {
            t.fail('JSON Syntax error in file: prod/' + filename)
            break
        }

        if (!checkStructure(devData, prodData)) {
            t.fail('Structure mismatch in config file: ' + filename)
        }
    }
})

/**
 * Checks recursively to ensure both objects and all corresponding
 * subobjects have the same key structure.
 * 
 * @param {object} a
 * @param {object} b
 * 
 * @returns {boolean}
 */
function checkStructure(a, b) {
    if (a == null || typeof a !== 'object' || Array.isArray(a) || b == null || typeof b !== 'object' || Array.isArray(b)) {
        return false
    }

    let aKeys = Object.keys(a)
    let bKeys = Object.keys(b)

    if (aKeys.length !== bKeys.length) {
        return false
    }

    for (let key of aKeys) {
        // return false if...
        if (
            b[key] === undefined // ...b doesn't have the field defined...
            || ( // ...or...
                a[key] != null // ...if a is an object (not an array)
                && typeof a[key] === 'object'
                && !Array.isArray(a[key]) 
                && ( // and the value at b[key] is not an object whose structure matches that of a[key]
                    b == null
                    || typeof b[key] !== 'object' 
                    || Array.isArray(b[key]) 
                    || !checkStructure(a[key], b[key])
                )
            )
        ) {
            return false
        }
    }

    return true
}