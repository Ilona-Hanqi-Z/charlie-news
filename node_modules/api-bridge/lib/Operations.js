'use strict'

const _ = require('lodash')
const Errors = require('./Errors')
const InvalidOperationError = Errors.InvalidOperationError
const FormattingError = Errors.FormattingError
const TYPES = ['number', 'string', 'boolean']

class OperationSet {

    /**
     * Constructor
     * 
     * @param {(object|object[])} ops operations for this set
     * @param {object} [models] reference to a bridge's models hash
     * 
     * @throws {FormattingError}
     */
    constructor(ops = [], models = {}) {
        this.operations = Array.isArray(ops) ? ops : [ops]
        this.models = models

        this.reformat()
    }

    /**
     * Add a new operation hash into the operation set
     * 
     * @param {(object|object[])} newOps operations to insert into the set
     * @param {object} options options hash
     * @param {string} options.before optional, insert before operation with the given $tag
     * @param {string} options.after optional, insert after operation with the given $tag
     * @param {integer} options.at optional, insert at this position
     * 
     * @returns {OperationSet} this
     */
    add(newOps = [], { before, after, at } = {}) {
        if (!Array.isArray(newOps)) {
            newOps = [newOps]
        }
        if (at != null && typeof at !== 'number') {
            throw new TypeError('Invalid "at" index. Expected number, got ' + typeof at)
        } else if (after && typeof after !== 'string') {
            throw new TypeError('Invalid "after" $tag. Expected string, got ' + typeof after)
        } else if (before && typeof before !== 'string') {
            throw new TypeError('Invalid "before" $tag. Expected string, got ' + typeof before)
        }

        let index = -1
        if (at != null) {
            index = at
        } else if (after || before) {
            index = this.getIndexByTag(after || before)
            if (index === -1) {
                throw new FormattingError('Cannot find operation with $tag of ' + (after || before))
            }
        }

        if (index >= 0) {
            if (after) {
                this.operations.splice(index + 1, 0, ...newOps)
            } else {
                this.operations.splice(index, 0, ...newOps)
            }
        } else {
            this.operations = this.operations.concat(newOps)
        }
        
        return this.reformat()
    }

    /**
     * Get the operation from this operation set
     * 
     * @param {(string|number)} id index or tag of the operations to get
     * 
     * @returns {(object|undefined)}
     * @throws {TypeError}
     */
    get(id) {
        if (typeof id === 'string') {
            id = this.getIndexByTag(id)
        } else if (typeof id !== 'number') {
            throw new TypeError('Invalid identifier. Expected number or string, got ' + typeof id)
        }

        return this.operations[id]
    }

    /**
     * Get the index of the operation containing the given tag
     * 
     * @param {string} tag
     * 
     * @returns {number} index of operation in set, -1 if not found
     * @throws {TypeError}
     */
    getIndexByTag(tag) {
        if (typeof tag !== 'string') {
            throw new TypeError('Tags must be strings, does not accept ' + typeof tag)
        }

        for (let i = this.operations.length - 1; i >= 0; --i) {
            if (this.operations[i].$tag === tag) {
                return i
            }
        }

        return -1
    }

    /**
     * Returns true if this operation set has no operations
     * 
     * @returns {boolean}
     */
    isEmpty() {
        return this.operations.length === 0
    }

    /**
     * Apply this operation set to the given object
     * 
     * TODO maintain shadow copy of operations that are always correctly formatted
     * 
     * @param {object} obj object to apply changes to
     * 
     * @returns {object}
     * @throws {InvalidOperationError} when operations are formatted incorrectly
     */
    process(obj) {
        for (let opSet of this.__operations) {
            obj = OperationSet.applyOperationAt(module.exports[opSet.operation], obj, opSet.field, opSet.args)
        }

        return obj
    }

    /**
     * Verifies and formats the option set
     * 
     * NOTE: Call this every time this.operations is altered
     * 
     * @param {object} ops operations object
     * 
     * @returns {OperationSet} this
     * @throws {FormattingError} when operation set definition format is invalid
     * @throws {InvalidOperationError} when operation parameters are invalid
     */
    reformat() {
        let opSet = this.operations

        if (!Array.isArray(opSet)) {
            opSet = [opSet]
        }

        delete this.__operations
        this.__operations = []

        for (let ops of this.operations) {
            if (typeof ops !== 'object') {
                throw new InvalidOperationError('Invalid operation syntax. Expected object, got ' + typeof ops)
            }

            // TODO startup verification of syntax
            for (let key in ops) {
                let tmp
                switch (key) {
                    /**
                     * Format:
                     *     {
                     *         $set: {                // field = '' or '.' for root object
                     *             field: value
                     *         }
                     *     }
                     */
                    case '$set':
                        if (typeof ops[key] !== 'object' || Array.isArray(ops[key])) {
                            throw new InvalidOperationError('Invalid value for $set. Expected object, got ' + typeof ops[key])
                        }
                        Object.keys(ops[key]).forEach(field => {
                            let fieldArr = OperationSet.parsePath(field)
                            let lastKey = fieldArr.pop()
                            this.__operations.push({
                                operation: key,
                                field: fieldArr,
                                args: [lastKey, ops[key][field]]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $unset: [field1, field2, ...]
                     *             OR
                     *         $unset: field
                     *             OR
                     *         $unset: ''/'.'
                     *     }
                     */
                    case '$unset':
                        if (typeof ops[key] === 'string') {
                            tmp = [ops[key]]
                        } else if (Array.isArray(ops[key]) && !ops[key].some(o => typeof o !== 'string')) {
                            tmp = ops[key]
                        } else {
                            throw new InvalidOperationError('Invalid value for $unset. Expected string or array of strings')
                        }
                        tmp.forEach(field => {
                            let fieldArr = OperationSet.parsePath(field)
                            let lastKey = fieldArr.pop()
                            this.__operations.push({
                                operation: key,
                                field: fieldArr,
                                args: [lastKey]
                            })
                        })
                        break
                    case '$tag':
                        if (typeof ops[key] !== 'string') {
                            throw new InvalidOperationError('Invalid value for $tag. Expected string, got ' + typeof ops[key])
                        }
                        break
                    /**
                     * Format:
                     *     {
                     *         $copy|$move: {
                     *             from: to,
                     *             ...
                     *         }
                     *     }
                     */
                    case '$move':
                    case '$copy':
                        if (typeof ops[key] !== 'object') {
                            throw new InvalidOperationError(`Invalid value for ${key}. Expected object, got ${typeof ops[key]}`)
                        }
                        Object.keys(ops[key]).forEach(field => {
                            if (typeof ops[key][field] !== 'string') {
                                throw new InvalidOperationError(`Invalid destination for ${key}. Expected string, got ${typeof ops[key][field]}`)
                            }

                            let commonFieldArr = []
                            let toFieldArr = OperationSet.parsePath(ops[key][field])
                            let fromFieldArr = OperationSet.parsePath(field)
                            
                            // extract the common root between fromField and toField
                            while (fromFieldArr.length > 0 && fromFieldArr[0] === toFieldArr[0]) {
                                commonFieldArr.push(fromFieldArr.shift())
                                toFieldArr.shift()
                            }

                            this.__operations.push({
                                operation: key,
                                field: commonFieldArr,
                                args: [fromFieldArr, toFieldArr]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $cast: {
                     *             field: number|string|boolean
                     *         }
                     *     }
                     */
                    case '$cast':
                        if (typeof ops[key] !== 'object') {
                            throw new InvalidOperationError('Invalid value for $cast. Expected object, got ' + typeof ops[key])
                        }
                        Object.keys(ops[key]).forEach(field => {
                            if (!TYPES.includes(ops[key][field])) {
                                throw new InvalidOperationError('Invalid type value for $cast. Expected `string`, `number` or `boolean`, got ' + ops[key][field])
                            }
                            this.__operations.push({
                                operation: '$cast',
                                field: OperationSet.parsePath(field),
                                args: [ops[key][field]]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $wrap: {
                     *             field: 'string' || []     // string to wrap in object under the given field name, or array if specified
                     *         }
                     *             OR
                     *         $wrap: 'string' || []        // wraps the root object
                     *     }
                     */
                    case '$wrap':
                        if (typeof ops[key] === 'string' || Array.isArray(ops[key])) {
                            tmp = { '.': ops[key] }
                        } else if (typeof ops[key] === 'object') {
                            tmp = ops[key]
                        } else {
                            throw new InvalidOperationError('Invalid value for $wrap. Expected string, array or object, got ' + typeof ops[key])
                        }
                        Object.keys(tmp).forEach(field => {
                            if (typeof tmp[field] !== 'string' && !Array.isArray(tmp[field])) {
                                throw new InvalidOperationError('Invalid value for $wrap. Expected string or array, got ' + typeof tmp[field])
                            }
                            this.__operations.push({
                                operation: key,
                                field: OperationSet.parsePath(field),
                                args: [tmp[field]]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $map: {
                     *             field: {
                     *                 '': null,        // Default value
                     *                 val1: newVal1,
                     *                 val2: newVal2,
                     *                 ...
                     *             }
                     *         }
                     *     }
                     */
                    case '$map':
                        if (typeof ops[key] !== 'object') {
                            throw new InvalidOperationError('Invalid value for $map. Expected object, got ' + typeof ops[key])
                        }
                        Object.keys(ops[key]).forEach(field => {
                            if (typeof ops[key][field] !== 'object') {
                                throw new InvalidOperationError('Invalid map in $map. Expected object, got ' + typeof ops[key][field] + ' at key ' + field)
                            }
                            this.__operations.push({
                                operation: key,
                                field: OperationSet.parsePath(field),
                                args: [ops[key][field]]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $func: function() { ... }
                     *     }
                     */
                    case '$func':
                        if (typeof ops[key] === 'function') {
                            tmp = { '.': ops[key] }
                        } else if (typeof ops[key] === 'object') {
                            tmp = ops[key]
                        } else {
                            throw new InvalidOperationError('Invalid value for $func. Expected function, got ' + typeof ops[key])
                        }
                        Object.keys(tmp).forEach(field => {
                            if (typeof tmp[field] !== 'function') {
                                throw new InvalidOperationError('Invalid value for $func. Expected function, got ' + typeof tmp[field] + ' at key ' + field)
                            }
                            this.__operations.push({
                                operation: key,
                                field: OperationSet.parsePath(field),
                                args: [tmp[field]]
                            })
                        })
                        break
                    /**
                     * Format:
                     *     {
                     *         $model: string
                     * 
                     *         OR
                     * 
                     *         $model: ['model1', 'model2']
                     * 
                     *         OR
                     * 
                     *         $model: {
                     *             'path.to.field': 'model'
                     *         }
                     * 
                     *         OR
                     * 
                     *         $model: {
                     *             'path.to.field': ['model1', 'model2']
                     *         }
                     *     }
                     */
                    case '$model':
                        if (typeof ops[key] === 'string' || Array.isArray(ops[key])) {
                            tmp = { '.': ops[key] }
                        } else if (typeof ops[key] === 'object') {
                            tmp = ops[key]
                        } else {
                            throw new InvalidOperationError('Invalid format for $model. Expected array, string or object, got ' + typeof ops[key])
                        }
                        Object.keys(tmp).forEach(field => {
                            let models
                            if (typeof tmp[field] === 'string') {
                                models = [tmp[field]]
                            } else if (Array.isArray(tmp[field]) && !tmp[field].some(s => typeof s !== 'string')) {
                                models = tmp[field]
                            } else {
                                throw new InvalidOperationError('Invalid value for $model. Expected string or string array, got ' + typeof ops[key])
                            }
                            models.forEach(model => {
                                if (!(this.models[model] instanceof OperationSet)) {
                                    console.warn(`api-bridge > WARNING! Model not found: '${model}'! If this model does not exist at runtime, will throw a fatal error`)
                                }
                                this.__operations.push({
                                    operation: key,
                                    field: OperationSet.parsePath(field),
                                    args: [model, this]
                                })
                            })
                        })
                        break
                    default:
                        throw new FormattingError('Invalid operation: ' + key)
                }
            }
        }

        return this
    }

    /**
     * Removes the operation from this op set
     * 
     * @param {(string|number)} id the index (number) or $tag (string) of the gap to remove
     * 
     * @returns {(object|undefined)} removed operation
     */
    remove(id) {
        let _op = undefined
        if (typeof id === 'string') {
            id = this.getIndexByTag(id)
        } else if (typeof id !== 'number') {
            throw new TypeError('Invalid identifier. Expected number or string, got ' + typeof id)
        }

        if (id >= 0) {
            _op = this.operations.splice(id, 1).pop()
        }

        this.reformat()
        return _op
    }

    /**
     * Reset the stored models used by this operation set to the given model set
     * 
     * @param {object} models the new model set (format { [modelName]: <OperationSet> })
     * 
     * @returns {OperationSet} this
     */
    resetModels(models = {}) {
        this.models = models
        return this
    }

    /**
     * Apply an operation to the specified field within an object
     * 
     * @param {function} op operation to apply (requires parameter structure of [obj, field, ...])
     * @param {any} obj
     * @param {(string|string[])} keys
     * @param {any[]} arg arguments to pass to the given operation
     * 
     * @returns {any}
     * @throws {TypeError}
     */
    static applyOperationAt(op, obj, keys = [], args = []) {
        if (typeof op !== 'function') {
            throw new TypeError('Invalid operation')
        }
        if (typeof obj !== 'object' && keys.length > 0) { // NOTE 'object' includes arrays, too
            return obj
        }

        // Get next steps in field traversal
        let key = keys[0]
        keys = keys.slice(1, keys.length)
        if (key === '$' && Array.isArray(obj)) {
            obj = obj.map(o => {
                return OperationSet.applyOperationAt(op, o, keys, args)
            })
        } else if (key === undefined) {
            obj = op(obj, ...args)
        } else {
            obj[key] = OperationSet.applyOperationAt(op, obj[key], keys, args)
        }

        return obj
    }

    /**
     * breaks down a period-delimited path string into an array of path
     * segments. 
     * 
     * @param {string} path
     * 
     * @returns {string[]}
     */
    static parsePath(path) {
        if (path === '.') {
            return []
        }

        return path.split('.').filter(s => s !== '')
    }
}

module.exports.Set = OperationSet

/**
 * BUILT-IN FORMATTING FUNCTIONS:
 *  $move - move a field (use this for renaming)
 *  $set - set a new field
 *  $unset - unset a new field
 *  $cast - case a field to a certain value
 *  $wrap - encase value within an object, under the given key, or in an array if []
 *  $map - map the values in the
 * 
 * SPECIAL
 *  $model - list of stored bridge models to apply in this opset
 *  $func - a function that takes 1 parameter (the response/request object) and returns the new version
 *  $tag - tags an update set for allowing programatic manipulation (first instance of tag is used)
 */

/**
 * Cast the object to the given type
 * 
 * @param {object} obj object to cast
 * @param {string} type NodeJS data type to case to (@see TYPES)
 * 
 * @returns {object}
 */
module.exports.$cast = (obj, type) => {
    if (obj === undefined) {
        // return undefined, cannot cast nothing
        return
    }
    if (type === 'number') {
        return Number(obj)
    }
    if (type === 'string') {
        return String(obj)
    }
    if (type === 'boolean') {
        return Boolean(obj)
    }

    // never happens as long as TYPES includes type
    return obj
}

/**
 * Copy the value from and to their drilled down positions
 * NOTE: This function mutates the 'obj' parameter
 * NOTE: The $move operation is just a utility function for calling this with __keepSource=false
 * 
 * @param {object} obj object to copy fields within
 * @param {string} from location of value to copy, in dot notation
 * @param {string} to location of where to paste value, in dot notation
 * @param {boolean} [__keepSource=true] if false, performs a $move, deleting the source value
 * 
 * @returns {object}
 */
module.exports.$copy = (obj, fromKeys = [], toKeys = [], __keepSource = true) => {
    if (typeof obj !== 'object') {
        return obj
    }

    let _obj, clipboard
    clipboard = _obj = obj

/**
 * TODO
 *     - Figure out a way to allow things like $copy(obj, ['field'], []) and $copy(obj, ['sub', field'], ['sub'])
 */

    // this loop goes through all common object keys (i.e. data.user.firstname & data.user.name.first => firstname & name.first, _obj = obj.data.user)
    // once all common fields are removed, then fetches value to copy/move
    for (let trimming = true, i = 0; i < fromKeys.length; ++i) {
        let fromKey = fromKeys[i]
        if (trimming && fromKey === toKeys[i]) {
            clipboard = _obj = _obj[fromKey]
            if (typeof _obj !== 'object') {
                // if the field being copied from does not exist, abort
                // TODO give user some control over what happens here
                return obj
            }
            toKeys.shift() // normalize destination keys
        } else {
            trimming = false // stop trimming the like fields

            if (i === fromKeys.length - 1) {
                if (__keepSource) { // if copying, clone the copied value
                    clipboard = _.cloneDeep(clipboard[fromKey]);
                } else { // if moving, delete the original value
                    let tmp = clipboard[fromKey]
                    delete clipboard[fromKey]
                    clipboard = tmp
                }
            } else {
                clipboard = clipboard[fromKey]
                if (typeof clipboard !== 'object') {
                    // if the field being copied from does not exist, abort
                    return obj
                }
            }
        }
    }

    // clipboard now contains data to be copied

    // TODO This CANNOT be here.
    // intended to check if destination is root
    // introduces edge cases for paths like FROM:user.name.full TO:user.name
    // winds up overwriting root object when destination IS NOT root
    if (toKeys.length === 0) {
        return clipboard
    }

    for (let i = 0; i < toKeys.length; ++i) {
        let toKey = toKeys[i]

        if (i === toKeys.length - 1) {
            _obj[toKey] = clipboard
        } else {
            // if next step is not an object, force it to be an empty object
            if (typeof _obj[toKey] !== 'object' || Array.isArray(_obj[toKey])) {
                // TODO give user control over these messages
                console.warn('api-bridge > WARNING! Attempting to call $move on invalid field ' + toKey);
                console.warn('api-bridge > Existing field will be overwritten by the $move operation')
                _obj[toKey] = {}
            }

            _obj = _obj[toKey]
        }
    }

    return obj
}

/**
 * Applies a function to an object. Utility function for normalizing calling
 * operations.
 * 
 * NOTE: The function, depending on implementation, may modify the object
 * 
 * @param {any} obj
 * @param {function} func
 * 
 * @returns {any}
 */
module.exports.$func = (obj, func) => {
    return func(obj)
}

/**
 * Change the value of obj by looking up its current value in the map
 * and setting it to the corresponding value
 * 
 * NOTE: A key of empty string represents the default value within map
 * 
 * @param {any} obj object to map fields within
 * @param {object} map map of values to apply to the field's value
 * 
 * @returns {any}
 */
module.exports.$map = (obj, map = {}) => {
    if (map.hasOwnProperty(obj)) {
        return map[obj]
    }
    
    return map['']
}

/**
 * Used to apply a model (sub-operation set) to an object. Used as utility
 * function for normalizing operation calls
 * 
 * NOTE: This will mutate the given object
 * 
 * @param {any} obj
 * @param {string} model the model to apply to the object
 * @param {OperationSet} parentOpSet the opset which contains the dictionary of models to refer to
 * 
 * @returns {any}
 * @throws {InvalidOperationError} when an invalid model is passed
 */
module.exports.$model = (obj, model, parentOpSet) => {
    if (!(parentOpSet.models[model] instanceof OperationSet)) {
        throw new InvalidOperationError('Invalid model in $model. Must be instance of OperationSet')
    }
    return parentOpSet.models[model].process(obj)
}

/**
 * Copy the value from and to their drilled down positions, deleting the old value
 * NOTE: This function mutates the 'obj' parameter
 * 
 * TODO should the function throw errors if the to/from fields don't exist on obj
 * 
 * @param {object} obj object to move fields within
 * @param {string} from location of value to copy, in dot notation
 * @param {string} to location of where to paste value, in dot notation
 * 
 * @returns {object}
 */
module.exports.$move = (obj, fromKeys = [], toKeys = []) => {
    return module.exports.$copy(obj, fromKeys, toKeys, false)
}

/**
 * Utility function for setting a value on a model
 * 
 * @param {object} obj object to apply set operation to
 * @param {string} field field to set on the object
 * @param {any} value value to return
 * 
 * @returns {any}
 */
module.exports.$set = (obj, field, value) => {
    if (!field) {
        return value
    }
    if (typeof obj === 'object') {
        obj[field] = value
    }

    return obj
}

/**
 * Unsets the field on the given object
 * NOTE: This function mutates the 'obj' parameter
 * 
 * @param {object} obj the object to mutate
 * @param {string} field field to update on object, in dot notation
 * 
 * @returns {undefined}
 */
module.exports.$unset = (obj, field) => {
    if (!field) {
        return undefined
    }
    if (typeof obj === 'object') {
        delete obj[field]
    }

    return obj
}

/**
 * Wraps the object with either an object (if wrapper is a string) or an array (if wrapper is an array)
 * 
 * @param {object} obj the object to wrap
 * @param {(string|array)} wrapper  if string, the key for the wrapped object
 *                                  if array, sets wrapped object as first element of an array
 * 
 * @returns {(object|array)}
 */
module.exports.$wrap = (obj, wrapper) => {
    return (typeof wrapper === 'string') ? { [wrapper]: obj } : [obj]
}