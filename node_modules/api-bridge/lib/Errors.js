'use strict'

const util = require('util')

// For errors regarding the data manipulation operations
module.exports.InvalidOperationError = function InvalidOperationError(message, extra) {
  Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name
  this.message = message
  this.extra = extra
}

// For errors regarding formatting any data files
module.exports.FormattingError = function FormattingError(message, extra) {
  Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name
  this.message = message
  this.extra = extra
}

util.inherits(module.exports.InvalidOperationError, Error)
util.inherits(module.exports.FormattingError, Error)