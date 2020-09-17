'use strict'

const Bridge = require('./lib/Bridge')
const Errors = require('./lib/Errors')
const fs = require('fs')
const Gap = require('./lib/Gap')
const Operations = require('./lib/Operations')

/**
 * TODO
 *      - Multi-file support
 *      - Response status can be set or mapped with an object in gap response?
 *      - Test ability to recursively call a bridge model, as well as call other models of the same bridge
 */

class Versioner {

    /**
     * Constructor
     * 
     * @param {object} options option hash
     * @param {string} [options.path] path to a json file containing an api-bridge config
     * @param {string} [options.versionKey] key on `res.locals` containing a string representation of the version of this request
     * @param {Bridge[]} [options.bridges=[]] any programatically generated Bridges
     */
    constructor({ path, versionKey = 'version', bridges = [] } = {}) {
        this.bridges = [] // Stores the bridges in version-order so that it can be traversed linearly in order to apply any necessary version changes
        this.bridge_map = {} // Used to reference bridges by version string
        this.versionKey = versionKey

        if (!Array.isArray(bridges)) {
            bridges = [bridges]
        }

        if (typeof path === 'string') {
            bridges = bridges.concat(this.loadFromFile(path))
        }

        this.addBridges(bridges)
    }

    /**
     * Adds new API bridges to the array of ordered bridges
     * 
     * @param {(Bridge|Bridge[])} bridge
     * 
     * @throws {TypeError}
     */
    addBridges(bridges = []) {
        if (!Array.isArray(bridges)) bridges = [bridges]

        for (let _bridge of bridges) {
            if (!_bridge instanceof Bridge) {
                throw new TypeError('Bridges must be instances of the Bridge class')
            }

            this.bridges.push(_bridge)
            this.bridge_map[_bridge.version] = _bridge
        }

        this.bridges.sort((a, b) => a.compareVersions(b))
    }

    /**
     * Gets a bridge by version number.
     * 
     * @param {string} version_code
     * @param {boolean} [generate_new=true] If true, generates a blank bridge that is added to the versioner's bridges and returned
     * 
     * @returns {(Bridge|null)}
     */
    getBridge(version_code, generate_new = true) {
        let bridge = this.bridge_map[version_code] || null

        if (bridge === null && generate_new) {
            bridge = new Bridge({ version: version_code })
            this.addBridges(bridge)
        }

        return bridge
    }

    /**
     * Express middleware for automatically applying formatting
     * to the server's error responses
     * @param {string} [versionKey] Parameter within `res.locals` that contains a string representation of the request's version number. Falls back to instantiated value
     * 
     * @returns {function} Middleware for processing errors
     */
    errorHandler(versionKey = false) {
        versionKey = versionKey || this.versionKey
        return (err, req, res, next) => {
            // If no version was specified, do not modify response
            if (!res.locals[versionKey]) return res.send(err)

            // If the middleware was never called for any reason, return the unchanged error response
            if (res._versionerParameters) {
                res._versionerParameters.responseGaps = res._versionerParameters.responseGaps || []
            } else {
                res._versionerParameters = {
                    responseGaps: this.getGaps(req.method, req.path, res.locals[versionKey])
                }
            }

            let headers = {}
            for (let key of Object.keys(res._headerNames)) {
                headers[res._headerNames[key]] = res._headers[key]
            }

            for (let gap of res._versionerParameters.responseGaps) {
                gap.error('headers').process(headers)
                err = gap.error('body').process(err)
            }

            res._headers = {}
            res._headerNames = {}
            res.set(headers)

            res._versionerParameters.skipFormatting = true
            res.send(err) // 2nd argument for skipping response formatting
        }
    }

    /**
     * Get an array of the gaps that are to be applied to a given request
     * 
     * @param {string} [method=GET] HTTP request method
     * @param {string} [path=/] URL of request
     * @param {string} [version=1.0] Version of this request
     * @param {boolean} [reverse=false] If true, returns the gaps in reverse order
     * 
     * @returns {Gap[]}
     */
    getGaps(method = 'GET', path = '/', version = '1.0', reverse = false) {
        let gaps = []

        for (let bridge of this.bridges) {
            if (bridge.compareVersions(version) <= 0) continue

            let gap = bridge.getGap(method, path)
            if (gap === undefined) continue

            gaps.push(gap)
        }

        return (reverse) ? gaps.reverse() : gaps
    }

    /**
     * Generates API bridges from the given json file
     * 
     * @param {string} path location of json file
     * 
     * @returns {Bridge[]}
     * @throws {FormattingError} errors thrown for invalid file formatting
     * @throws {SyntaxError} errors thrown parsing JSON
     * @throws {Error} errors thrown by file io
     */
    loadFromFile(path) {
        let data = JSON.parse(fs.readFileSync(path))
        let bridges = []

        if (!data) return bridges;
        if (!Array.isArray(data)) data = [data]

        for (let _data of data) {
            if (!typeof _data === 'object' || Array.isArray(_data)) {
                throw new Errors.FormattingError('Bridges must be defined as objects, got: ' + JSON.stringify(_data))
            }

            let _bridge = new Bridge({
                version: _data.version,
                description: _data.description,
                models: _data.models
            })

            for (let _gap of _data.gaps) {
                _gap.bridge = _bridge // set parent
                _gap.endpoint = _gap.endpoint || _gap.endpoints // alias
                // If gap has "path" set, don't check endpoint string
                if (typeof _gap.path === 'string') {
                    _bridge.addGap(new Gap(_gap))
                    continue
                }
                if (!_gap.endpoint) {
                    console.log(_gap)
                    throw new Errors.FormattingError('Gaps must have at least the `endpoint` or `path` field set')
                }
                if (!Array.isArray(_gap.endpoint)) _gap.endpoint = [_gap.endpoint]

                _gap.endpoint.forEach(endpoint => {
                    if (typeof endpoint !== 'string') throw new Errors.FormattingError('Gap endpoint(s) must be string(s)')
                    let [_method = null, _path = null] = endpoint.trim().split(' ')

                    if (_path) {
                        _gap.path = _path
                        _gap.method = _method
                    } else { // If no method was provided (e.g. "/users" vs "GET /users"), swap the extracted values
                        _gap.path = _method
                        _gap.method = null
                    }

                    _bridge.addGap(new Gap(_gap))
                })
            }

            bridges.push(_bridge)
        }

        return bridges
    }

    /**
     * Express middlewares for automatically applying formatting
     * to the server's requests and responses
     * 
     * @param {string} [versionKey] Parameter within `res.locals` that contains a string representation of the request's version number. Falls back to instantiated value
     * 
     * @returns {function[]} Middlewares in ascending order of version
     */
    middleware(versionKey = false) {
        versionKey = versionKey || this.versionKey
        return (req, res, next) => {
            let gaps = this.getGaps(req.method, req.path, res.locals[versionKey])

            res._versionerParameters = {
                responseGaps: gaps // Will be in order of oldest -> most recent versions
            }

            for (let i = gaps.length - 1; i >= 0; --i) {
                if (gaps[i].shouldReply(res)) {
                    // Gap#shouldReply will send response automatically if applicable
                    return;
                }

                gaps[i].request('headers').process(req.headers)
                gaps[i].request('body').process(req.body)
                gaps[i].request('query').process(req.query)
                gaps[i].request('params').process(req.params)
            }

            let tmp = res.send.bind(res)
            res.send = function(data) {
                if (res._versionerParameters.skipFormatting) {
                    return tmp(data)
                }
                let headers = {}
                for (let key of Object.keys(res._headerNames)) {
                    headers[res._headerNames[key]] = res._headers[key]
                }

                for (let _gap of res._versionerParameters.responseGaps) {
                    headers = _gap.response('headers').process(headers)
                    data = _gap.response('body').process(data)
                }

                res._headers = {}
                res._headerNames = {}
                res.set(headers)

                tmp(data)
            }

            next()
        }
    }
}

module.exports = Versioner
module.exports.Bridge = Bridge
module.exports.Gap = Gap
module.exports.InvalidOperationError = Errors.InvalidOperationError
module.exports.FormattingError = Errors.FormattingError