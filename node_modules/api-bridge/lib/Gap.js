'use strict'

const FormattingError = require('./Errors').FormattingError
const InvalidOperationError = require('./Errors').InvalidOperationError
const Operations = require('./Operations')
const Path2RegExp = require('path-to-regexp')

/**
 * Gap class represents changes to a specific endpoint on a specific version.
 * Gaps are collected by the Bridge class with the corresponding API version
 * in to represent all endpoints affected by this version change.
 */
class Gap {

    /**
     * Constructor
     * 
     * TODO response.status, error.status?
     * 
     * @param {object} options options hash
     * @param {string} options.path URL path to API resource (i.e. /users/list)
     * @param {string} [options.method=GET] HTTP method of request
     * @param {string} [options.description] description of changes
     * @param {object} [options.request] options hash for request mutation
     * @param {object} [options.response] options hash for response mutation
     * @param {object} [options.error] options hash for error handler mutation
     * @param {object} [options.reply=false] response to immediately reply with, ending the connection
     * @param {object} [options.bridge=null] parent bridge of this gap
     * 
     * @throws {TypeError}
     */
    constructor({
        path,
        method = 'GET',
        description,

        request = {},
        response = {},
        error = {},
        reply = false,
        bridge = null
    } = {}) {
        if (typeof path === 'string') {
            this.path = path
            this.pathKeys = []
            this.pathRegex = Path2RegExp(this.path, this.pathKeys)
        } else {
            throw TypeError('Missing or invalid required parameter "path"')
        }

        if (typeof method === 'string') {
            this.method = method.toUpperCase()
        } else {
            throw TypeError('Missing or invalid required parameter "method"')
        }

        this.bridge = bridge
        this.description = description
        let _models = (bridge === null) ? {} : bridge.models
        this._operations = {
            request: {
                body: new Operations.Set(request.body, _models),
                headers: new Operations.Set(request.headers, _models),
                query: new Operations.Set(request.query, _models),
                params: new Operations.Set(request.params, _models)
            },
            response: {
                body: new Operations.Set(response.body, _models),
                headers: new Operations.Set(response.headers, _models)
            },
            error: {
                body: new Operations.Set(error.body, _models),
                headers: new Operations.Set(error.headers, _models)
            }
        }

        if (reply === false) {
            this.reply = reply
        } else if (typeof reply === 'object') {
            this.reply = {
                status: reply.status || 200,
                headers: reply.headers || {
                    'Content-Type': 'text/plain'
                },
                body: reply.body || 'OK'
            }
        } else {
            throw new FormattingError('Invalid value for reply parameter')
        }
    }

    /**
     * Used to fetch the operation sets for the error and its parts
     * 
     * @param {string} medium body, headers, query, params
     */
    error(medium) {
        if (typeof medium === undefined) {
            return this._operations.error
        } else if(this._operations.error[medium]) {
            return this._operations.error[medium]
        } else {
            throw new ReferenceError('Unknown error medium: ' + medium)
        }
    }

    /**
     * Used to fetch the operation sets for the request and its parts
     * 
     * @param {string} medium body, headers, query, params
     */
    request(medium) {
        if (typeof medium === undefined) {
            return this._operations.request
        } else if(this._operations.request[medium]) {
            return this._operations.request[medium]
        } else {
            throw new ReferenceError('Unknown request medium: ' + medium)
        }
    }

	/**
	 * Reset the stored models used by this gap's operation sets to the given model set
	 * 
	 * @param {object} models the new model set (format { [modelName]: <OperationSet> })
	 */
	resetModels(models) {
        this._operations.request.body.resetModels(models)
        this._operations.request.headers.resetModels(models)
        this._operations.request.query.resetModels(models)
        this._operations.request.params.resetModels(models)
        this._operations.response.body.resetModels(models)
        this._operations.response.headers.resetModels(models)
        this._operations.error.body.resetModels(models)
        this._operations.error.headers.resetModels(models)
	}

    /**
     * Used to fetch the operation sets for the response and its parts
     * 
     * @param {string} medium body, headers
     */
    response(medium) {
        if (typeof medium === undefined) {
            return this._operations.response
        } else if(this._operations.response[medium]) {
            return this._operations.response[medium]
        } else {
            throw new ReferenceError('Unknown response medium: ' + medium)
        }
    }

    /**
     * Returns true if this Gap returns a static reply, else false
     * NOTE: This function will complete the express request, closing the connection
     * 
     * @param {express.Response} res express response object
     * 
     * @returns {boolean} true if replied, else false
     */
    shouldReply(res) {
        if (this.reply) {
            // unset any headers on the response
            res._headers = {}
            res._headerNames = {}

            res.status(this.reply.status)
            res.set(this.reply.headers)
            res.send(this.reply.body)
            res.end()
            return true
        } else {
            return false
        }
    }

    /**
     * Tests the given URI to see if it matches the regex of this Gap
     * 
     * @param {string} method the method of the gap to fetch 
     * @param {string} path path to test
     * 
     * @returns {boolean} true if match, else false
     */
    test(method, path) {
        return (method.toUpperCase() === this.method) && (this.path === path || this.pathRegex.test(path))
    }
}

module.exports = Gap