'use strict'

const Gap = require('./Gap')
const InvalidOperationError = require('./Errors').InvalidOperationError
const Operations = require('./Operations')

/**
 * This class represents all of the interface changes between API
 * versions. Each Bridge has a collection of Gaps representing all
 * differences between the previous API version and the current one.
 */
class Bridge {

    /**
     * Constructor
     * 
     * @param {object} options option hash
     * @param {string} options.version version string for this bridge
     * @param {Gap[]} options.gaps array of endpoint alterations
     * @param {string} [options.description] description of this version bridge
     * @param {Object} [options.models] Tagged operations which can be used by any gap within the bridge
     * 
     * @throws {TypeError}
     */
    constructor({
        version,
        description,
        gaps = [],
        models = {}
    } = {}) {
        this.gaps = []
        this.description = description
        this.models = models

        // Instantiate OpSets
        Object.keys(this.models).forEach(k => {
            this.models[k] = new Operations.Set(this.models[k], this.models)
        })

        if (typeof version === 'string') {
            this.version = version
            this.versionSegments = version.split('.').map(n => parseInt(n, 10))
        } else {
            throw TypeError('version must be a period-delimited string of numbers')
        }

        if (!Array.isArray(gaps)) gaps = [gaps]
        for (let gap of gaps) {
            if (!gap instanceof Gap) {
                throw TypeError('Gaps must be instances of or extension of the Gap class')
            }

            gap.bridge = this
            this.gaps.push(gap)
        }
    }

    /**
     * Adds a new Gap to this bridge's gaps
     * NOTE: If a Gap already exists with this path+method,
     * it will be overwritten by the new Gap
     * 
     * @param {Gap} gap
     * @throws {TypeError}
     */
    addGap(gap) {
        if (!gap instanceof Gap) {
            throw TypeError('Gaps must be derivatives of the Gap class')
        }

        gap.bridge = this
        gap.resetModels(this.models)
        this.gaps.push(gap)
    }

    /**
     * Compares this bridge's version to that of the other bridge's
     * 
     * @param {(string|Bridge)} other bridge to compare against
     * 
     * @returns {number} -1 if this < other, 0 if this = other, 1 if this > other
     * @throws {TypeError}
     */
    compareVersions(other) {
        let vSegs

        if (other instanceof Bridge) {
            vSegs = other.versionSegments
        } else if (typeof other === 'string') {
            vSegs = other.split('.').map(n => parseInt(n, 10))
        } else {
            throw TypeError('Compared object must be a string or an instance of Bridge')
        }

        for (let i = 0; i < this.versionSegments.length; ++i) {
            if (vSegs[i] === undefined) {
                vSegs[i] = 0
            }

            if (this.versionSegments[i] > vSegs[i]) {
                return 1
            } else if (this.versionSegments[i] < vSegs[i]) {
                return -1
            }
        }

        return 0
    }

    /**
     * Gets the Gap object matching the given path and HTTP method.
     * If not found explicitly, will check regex for any path parameters
     * NOTE: Direct path matches always take presidence over regex matches
     * 
     * @param {string} endpoint i.e. "GET /user/payment"
     * 
     * OR
     * 
     * @param {string} method HTTP method of the Gap to fetch
     * @param {string} path path of the Gap to fetch
     * 
     * @returns {(Gap|undefined)}
     */
    getGap(method, path = false) {
        if (path === false) {
            [method, path] = method.split(' ')
        }

        return this.gaps.find(g => g.test(method, path))
    }

    /**
     * Sets a model in the Bridge. If this model previously
     * exists, it is overwritten.
     * 
     * @param {string} procName name of the model
     * @param {(object|function)} op function or operation set
     * @throws {TypeError}
     */
    setModels(procName, op) {
        // Allow passing multiple operations within an object
        let newModels = {}
        if (typeof model === 'object') {
            newModels = model
        } else {
            newModels[procName] = op
        }

        if (typeof op === 'object') {
            op = new Operations.Set(op)
        } else if (typeof op === 'function') {
            op = new Operations.Set({ $func: op })
        } else {
            throw new TypeError('Operation must be an operations hash or a function')
        }

        Object.keys(newModels).forEach(proc => {
            this.models[proc] = op
        })

        // Update all of the bridge's gap models
        for (let gap of this.gaps) {
            gap.resetModels(this.models)
        }
    }
}

module.exports = Bridge
