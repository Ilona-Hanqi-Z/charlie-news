'use strict'

const assert = require('assert')
const Bridge = require('../lib/Bridge')
const Versioner = require('../index')

/**
 * Creates an empty set of middleware parameters
 * 
 * @param {function} cb express response#send function
 * @param {function} cb middleware next function
 * 
 * @returns {object}
 */
function makeRequest(send) {
	let tmp = {
		req: {
			locals: {},
			body: {},
			query: {},
			params: {},
			headers: {}
		},
		res: {
			_headers: {},
			_headerNames: {},
			locals: {},
			send,
			set: function(arg1, arg2) {
				if (typeof arg1 === 'object') {
					Object.keys(arg1).forEach(key => {
						tmp.res.set(key, arg1[key])
					})
				} else if (typeof arg1 === 'string') {
					tmp.res._headerNames[arg1.toLowerCase()] = arg1
					tmp.res._headers[arg1.toLowerCase()] = String(arg2)
				}
			}
		}
	}
	return tmp
}

describe('Versioner', function() {
	describe('#addBridges', function() {
		it('should add a bridge to the versioner', function() {
			const _b1 = new Bridge({ version: '1.6' })
			const _b2 = new Bridge({ version: '3.9' })
			const _b3 = new Bridge({ version: '1.1' })
			const _b4 = new Bridge({ version: '2.1' })
			const _v = new Versioner({ bridges: _b1 })
			_v.addBridges(_b2)
			_v.addBridges([_b3, _b4])
			assert.equal(_v.bridges.length, 4)
			assert.equal(_v.bridges[0].version, '1.1')
			assert.equal(_v.bridges[1].version, '1.6')
			assert.equal(_v.bridges[2].version, '2.1')
			assert.equal(_v.bridges[3].version, '3.9')
		})
	})

	describe('#loadFromFile', function() {
		it('should correctly load and parse json file', function() {
			let versioner = new Versioner({ path: './test/test.json' })
			assert.equal(versioner.bridges.length, 3)
			assert.equal(versioner.bridges[0].gaps.length, 1)
			assert.equal(versioner.bridges[1].gaps.length, 1)
			assert.equal(versioner.bridges[2].gaps.length, 5)
		})
	})

	describe('#errorHandler', function() {
		it('should correctly process an error response object (calling #middleware)', function(done) {
			let versioner = new Versioner({ path: './test/test.json' })
			let { req, res } = makeRequest(result => {
				if (!Array.isArray(result)) {
					done(new Error('Unexpected result; expected array, got ' + typeof result))
				} else if (result.length !== 1) {
					done(new Error('Unexpected result length; expected 1, got ' + result.length))
				} else if (result[0].test !== 'ing') {
					done(new Error('Unexpected result value; expected 1, got ' + result.length))
				} else {
					done()
				}
			})

			req.method = 'GET'
			req.path = '/user/test'
			res.locals.version = '1.0'

			versioner.middleware()(req, res, () => {})
			versioner.errorHandler()({ test: 'ing' }, req, res, () => {})
		})
		it('should correctly process an error response object (not calling #middleware)', function(done) {
			let versioner = new Versioner({ path: './test/test.json' })
			let { req, res } = makeRequest(result => {
				if (!Array.isArray(result)) {
					done(new Error('Unexpected result; expected array, got ' + typeof result))
				} else if (result.length !== 1) {
					done(new Error('Unexpected result length; expected 1, got ' + result.length))
				} else if (result[0].test !== 'ing') {
					done(new Error('Unexpected result value; expected 1, got ' + result.length))
				} else {
					done()
				}
			})

			req.method = 'GET'
			req.path = '/user/test'
			res.locals.version = '1.0'

			versioner.errorHandler()({ test: 'ing' }, req, res, () => {})
		})
	})

	describe('#middleware', function() {
		it('should correctly process a request', function() {

		})
	})
})