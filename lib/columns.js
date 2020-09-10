'use strict';

const _ = require('lodash');

// Private variables
const __cols = new WeakMap();

class Columns extends Array {
    
    static get[Symbol.species]() { return Array; }
    
    constructor(cols, _original) {
        super(...cols);
        __cols.set(this, _original || Array(...cols));
    }
    
    /**
     * Return a new column object with the intersection of the provided
     * columns and this one
     * 
     * @param cols {String|Array[String]}
     * 
     * @returns {Columns}
     */
    with(cols) {
        let _cols = __cols.get(this)
        let first = this.length === _cols.length;
        if (!cols) return this;
        if (!_.isArray(cols)) cols = Array(...arguments);
        cols = _.intersection(cols, _cols);
        return new Columns(_.union(first ? [] : this, cols), _cols);
    }
    
    
    /**
     * Return a new Columns object with the current Columns'
     * columns minus the ones provided
     * 
     * @param cols {String|Array[String]}
     * 
     * @returns {Columns}
     */
    without(cols) {
        if (!cols) return this;
        if (!_.isArray(cols)) cols = Array(...arguments);
        return new Columns(_.difference(this, cols), __cols.get(this));
    }

    /**
     * Return a new Columns object with the current Columns'
     * columns, plus the given columns
     * 
     * @param cols {String|Array[String]}
     * 
     * @returns {Columns}
     */
    including(cols) {
        if (!cols) return this;
        if (!_.isArray(cols)) cols = Array(...arguments);
        return new Columns(this.concat(cols));
    }
    
    
    /**
     * Generate a new object by filtering the given object by
     * these Columns 
     * 
     * @param obj {Object}
     * 
     * @returns {Object}
     */
    clean(obj = {}) {
        let result = {};
        for (let col of this) {
            if (obj[col] !== undefined) {
                result[col] = _.clone(obj[col])
            }
        }
        return result;
    }
};

module.exports = function() { return new Columns(arguments) };