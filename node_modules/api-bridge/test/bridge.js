'use strict'

const assert = require('assert')
const Bridge = require('../lib/Bridge')
const Gap = require('../lib/Gap')

describe('Bridge', function() {
	let bridge

	describe('#constructor', function() {
		it('should initialize with a single gap', function() {
			const gap = new Gap({
				path: '/user/*',
				method: 'get',
				description: 'testing123',
				request: {}
			})
			bridge = new Bridge({
				version: '1.0',
				description: 'test',
				gaps: [ gap ]
			})

			assert.equal(bridge.gaps.length, 1)
			assert.equal(bridge.gaps[0].description, 'testing123')
		})
	})

	describe('#compareVersions', function() {
		it('should compare itself to version strings', function() {
			assert.equal(bridge.compareVersions('0.5'), 1)
			assert.equal(bridge.compareVersions('0.5.0'), 1)
			assert.equal(bridge.compareVersions('1.0'), 0)
			assert.equal(bridge.compareVersions('1.0.0'), 0)
			assert.equal(bridge.compareVersions('2.3'), -1)
			assert.equal(bridge.compareVersions('2.3.0'), -1)
		})
		it('should compare itself to the version of another bridge', function() {
			const b1 = new Bridge({ version: '1.6.4' })
			const b2 = new Bridge({ version: '1.6.2' })
			const b3 = new Bridge({ version: '3.9.14' })

			assert.equal(b1.compareVersions(b2), 1)
			assert.equal(b1.compareVersions(b1), 0)
			assert.equal(b1.compareVersions(b3), -1)
		})
	})

	describe('#getGap', function() {
		it('should return the proper gap for a request to `GET /user`', function() {
			assert.equal(bridge.getGap('GET', '/user/test').description, 'testing123')
		})
		it('should return nothing for a request that is not gapped', function() {
			assert.equal(bridge.getGap('put', '/car/purchase'), undefined)
		})
	})

	describe('#addGap', function() {
		it('should add a new gap under the bridge', function() {
			const gap = new Gap({
				path: '/car',
				method: 'get',
				description: 'testing321',
				request: {}
			})

			bridge.addGap(gap)
			assert.equal(bridge.getGap('GET', '/car').description, 'testing321')
		})
	})

	describe('#setModels', function() {
		it('should performed the programatically added models', function() {
			const bridge = new Bridge({
				version: '1.0'
			})
			const gap = new Gap({
				bridge,
				path: '/test',
				response: {
					body: {
						$model: {
							'.': 'testFunc'
						}
					}
				}
			})
			bridge.addGap(gap)
			bridge.setModels('testFunc', function(obj) {
				obj.isTestSuccessful = true
				return obj
			})

			assert.notEqual(gap, undefined)

			let obj = { testCode: 5 }
			obj = gap.response('body').process(obj)
			assert.deepStrictEqual(obj, { testCode: 5, isTestSuccessful: true })
		})
	})
})