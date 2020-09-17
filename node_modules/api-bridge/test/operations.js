'use strict'

/**
 * Testing for...
 *      - OPERATION SET TESTS
 *      - Test $func
 *      - Test $tag
 */

const assert = require('assert')
const Operations = require('../lib/Operations')

/**
 * Checks that two objects are exactly the same
 * TODO THIS SHOULDNT BE HERE
 * NOTE: Type sensitive
 * 
 * @param {object} o1
 * @param {object} o2
 * 
 * @returns {boolean}
 */

describe('Operations', function() {
    let obj = {
        info: {
            time: 1479738679324,
            code: "6",
            signature: 'tyfhi4532yjf78435xko9j'
        },
        data: [
            {
                name: 'Bob Jones',
                age: 75,
                state: 'NJ',
                location: [10, 10]
            },
            {
                name: 'Bob Jones',
                age: 75,
                state: 'NY',
                location: [10, 10]
            }
        ]
    }

    describe('$cast', function() {
        it('should cast a string to a number', function() {
            let result = Operations.$cast('6', 'number')
            assert.strictEqual(result, 6)
        })
        it('should cast a number to a string', function() {
            let result = Operations.$cast(4, 'string')
            assert.deepStrictEqual(result, '4')
        })
    })

    describe('$set', function() {
        it('should set the entire object when not passed a field', function() {
            let result = Operations.$set(9, '', 'yes')
            assert.strictEqual(result, 'yes')
        })
        it('should set the specified object field', function() {
            let result = Operations.$set({ test: '4' }, 'test', 'yes')
            assert.deepStrictEqual(result, { test: 'yes' })
        })
    })

    describe('$unset', function() {
        it('should unset the entire object when not passed a field', function() {
            let result = Operations.$unset(9, '')
            assert.strictEqual(result, undefined)
        })
        it('should unset the specified object field', function() {
            let result = Operations.$unset({ test: '4', ey: 'yo' }, 'ey')
            assert.deepStrictEqual(result, { test: '4' })
        })
    })

    describe('$wrap', function() {
        it('should wrap the value within an object', function() {
            let result = Operations.$wrap(6, 'key')
            assert.deepEqual(result, { key: 6 })
        })
        it('should wrap the value within an array', function() {
            let result = Operations.$wrap(6, [])
            assert.deepEqual(result, [6])
        })
    })

    describe('$map', function() {
        it('should map the value correctly', function() {
            let result = Operations.$map(4, { 4: true })
            assert.strictEqual(result, true)
        })
        it('should map the value to the default', function() {
            let result = Operations.$map(4, { '': 'default', missingField: true })
            assert.deepStrictEqual(result, 'default')
        })
    })

    describe('$copy', function() { // TODO
        it('should copy the a field within an object', function() {
            let result = Operations.$copy({ hello: { there: 'sir' } }, ['hello', 'there'], ['mr'])
            assert.deepStrictEqual(result, { mr: 'sir', hello: { there: 'sir' } })
        })
        it('should copy the a field within an object, creating any missing destination objects', function() {
            let result = Operations.$copy({ hello: { there: { sir: 'how are you' } } }, ['hello', 'there'], ['hello', 'my', 'good'])
            assert.deepStrictEqual(result, { hello: { there: { sir: 'how are you' }, my: { good: { sir: 'how are you' } } } })
        })
    })

    describe('$move', function() { // TODO
        it('should move the a field within an object', function() {
            let result = Operations.$move({ hello: { there: 'sir' } }, ['hello', 'there'], ['mr'])
            assert.deepStrictEqual(result, { mr: 'sir', hello: { } })
        })
        it('should move the a field within an object, creating any missing destination objects', function() {
            let result = Operations.$move({ hello: { there: { sir: 'how are you' } } }, ['hello', 'there'], ['hello', 'my', 'good'])
            assert.deepStrictEqual(result, { hello: { my: { good: { sir: 'how are you' } } } })
        })
    })

    describe('Set', function() {
        let OpSet

        it('should construct an op set containing a single $set operation', function() {
            OpSet = new Operations.Set([
                {
                    $tag: 'first',
                    $set: {
                        temp: 'value',
                        isTest: true
                    }
                }
            ])

            assert.equal(OpSet.operations.length, 1)
        })
        
        describe('#applyOperationAt', function() {
            it('should apply $cast to the correct field in the object', function() {
                let obj = {
                    users: [
                        { name: 'bob', age: '46' },
                        { name: 'billy', age: '47' },
                        { name: 'bfrank', age: '48' }
                    ]
                }

                obj = Operations.Set.applyOperationAt(Operations.$cast, obj, ['users', '$', 'age'], ['number'])

                assert.deepStrictEqual(obj, {
                    users: [
                        { name: 'bob', age: 46 },
                        { name: 'billy', age: 47 },
                        { name: 'bfrank', age: 48 }
                    ]
                })
            })
        })
        
        describe('#add', function() {
            it('should add a new $unset operation to the set', function() {
                OpSet.add({
                    $tag: 'fifth',
                    $unset: 'result.temp'
                })

                assert.equal(OpSet.operations.length, 2)
                assert.equal(OpSet.operations[1].$tag, 'fifth')
            })

            it('should use `at` to add op at position 1 in the op set', function() {
                OpSet.add({
                    $tag: 'third',
                    $wrap: 'result'
                }, {
                    at: 1
                })

                assert.equal(OpSet.operations.length, 3)
                assert.equal(OpSet.operations[0].$tag, 'first')
                assert.equal(OpSet.operations[1].$tag, 'third')
                assert.equal(OpSet.operations[2].$tag, 'fifth')
            })

            it('should add an operation before $tag=third in the op set', function() {
                OpSet.add({
                    $tag: 'second',
                    $set: { code: 705 }
                }, {
                    before: 'third'
                })

                assert.equal(OpSet.operations.length, 4)
                assert.equal(OpSet.operations[0].$tag, 'first')
                assert.equal(OpSet.operations[1].$tag, 'second')
                assert.equal(OpSet.operations[2].$tag, 'third')
                assert.equal(OpSet.operations[3].$tag, 'fifth')
            })

            it('should add an operation after $tag=third in the op set', function() {
                OpSet.add({
                    $tag: 'fourth',
                    $move: { 'result.code': 'result.status' }
                }, {
                    after: 'third'
                })

                assert.equal(OpSet.operations.length, 5)
                assert.equal(OpSet.operations[0].$tag, 'first')
                assert.equal(OpSet.operations[1].$tag, 'second')
                assert.equal(OpSet.operations[2].$tag, 'third')
                assert.equal(OpSet.operations[3].$tag, 'fourth')
                assert.equal(OpSet.operations[4].$tag, 'fifth')
            })
        })

        describe('#getIndexByTag', function() {
            it('should return the correct index of the operation with the given tag', function() {
                assert.equal(OpSet.getIndexByTag('third'), 2)
            })
        })

        describe('#get', function() {
            it('should return the operation by $tag', function() {
                assert.deepStrictEqual(OpSet.get('second'), {
                    $tag: 'second',
                    $set: { code: 705 }
                })
            })

            it('should return the operation at a given index', function() {
                assert.deepStrictEqual(OpSet.get(3), {
                    $tag: 'fourth',
                    $move: { 'result.code': 'result.status' }
                })
            })
        })

        describe('#remove', function() {
            it('should remove the operation with the given $tag', function() {
                assert.deepStrictEqual(OpSet.remove('fourth'), {
                    $tag: 'fourth',
                    $move: { 'result.code': 'result.status' }
                })
                assert.equal(OpSet.operations.length, 4)
                assert.equal(OpSet.operations[0].$tag, 'first')
                assert.equal(OpSet.operations[1].$tag, 'second')
                assert.equal(OpSet.operations[2].$tag, 'third')
                assert.equal(OpSet.operations[3].$tag, 'fifth')
            })
        })

        describe('#process', function() {
            it('should correctly process a given object based on the operations', function() {
                let now = Date.now()
                let OpSet = new Operations.Set([
                    { $move: { 'users.$.age': 'users.$.info.age' } },
                    {
                        $set: { 'timestamp': now },
                        $cast: { 'users.1.info.age': 'number' }
                    }
                ])
                let obj = {
                    users: [
                        { name: 'bob', age: '46' },
                        { name: 'billy', age: '47' },
                        { name: 'bfrank', age: '48' }
                    ]
                }

                assert.deepStrictEqual(
                    OpSet.process(obj),
                    {
                        timestamp: now,
                        users: [
                            { name: 'bob', info: { age: '46' } },
                            { name: 'billy', info: { age: 47 } },
                            { name: 'bfrank', info: { age: '48' } }
                        ]
                    }
                )
            })
        })
    })
})