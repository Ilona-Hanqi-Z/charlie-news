'use strict'

const assert = require('assert')
const Gap = require('../lib/Gap')

describe('Gap', function() {
    let gapRespond = new Gap({
        path: '/user',
        method: 'GET',

        request: {
            params: [
                { $wrap: 'one' },
                { $wrap: [] },
                { $wrap: 'two' }
            ],
            query: {
                $copy: {
                    'user.name': 'user.full_name',
                    'user.age': 'age'
                }
            },
            body: {
                $unset: 'oldParam',
                $set: {
                    newParam: true
                },
                $func: obj => {
                    obj.name = obj.name.toUpperCase()
                    return obj
                }
            },
            headers: {
                $set: {
                    '': {
                        'Content-Type': 'text/plain',
                        'Authorization': 'Bearer 12345'
                    }
                }
            }
        },
        response: {
            body: [
                { $wrap: 'result' },
                { $map: {
                  'result.code': {
                      '200': 'OK',
                      '404': 'NOT FOUND',
                      '500': 'ERROR',
                      '': 'UNKNOWN'
                  }
                } }
            ],
            headers: {
                $move: {
                    'x-auth': 'Authorization'
                }
            }
        },
        error: {
            body: {
                $cast: {
                    cast: 'number'
                }
            },
            headers: {
                $set: {
                    '': {
                        header1: '3'
                    }
                }
            }
        }
    })
    let gapReply = new Gap({
        path: '/user',
        method: 'post',
        reply: {
            status: 404,
            headers: {
                'Content-Type': 'application/json'
            },
            body: '{"error":"not-found","code":404}'
        }
    })

    describe('#test', function() {
        it('should match paths with URL params', function() {
            let _gap = new Gap({
                path: '/user/:name/update',
                method: 'put'
            })

            assert.equal(_gap.test('PUT', '/user/barry/update'), true)
            assert.equal(_gap.test('put', '/user/barry%20jones/update'), true)
            assert.equal(_gap.test('PUT', '/user/barry+jones/update'), true)
            assert.equal(_gap.test('PUT', '/user/update'), false)
            assert.equal(_gap.test('POST', '/user/barry/update'), false)
            assert.equal(_gap.test('PUT', '/user/barry/jones/update'), false)
        })
    })

    describe('#shouldReply', function() {
        // Mock ExpressJS response object
        let res = {
            _status: -1,
            _headers: {},
            _body: null,

            status: code => res._status = code,
            set: (name, val) => {
                if (typeof name === 'object'){
                    for (let key in name) res._headers[key] = name[key]
                } else {
                    res._headers[name] = val
                }
            },
            send: body => res._body = body,
            end: () => {}
        }

        it('should return false if `reply` is not set', function() {
            assert.equal(gapRespond.shouldReply(res), false)
            assert.equal(res._status, -1)
            assert.equal(res._body, null)
            assert.equal(Object.keys(res._headers).length, 0)
        })
        it('should send a response, since reply is set', function() {
            assert.equal(gapReply.shouldReply(res), true)
            assert.equal(res._status, 404)
            assert.equal(res._body, '{"error":"not-found","code":404}')
            assert.equal(Object.keys(res._headers).length, 1)
            assert.equal(res._headers['Content-Type'], 'application/json')
        })
    })

    describe('#addOperation', function() {
        let _gap = new Gap({
            path: '/test',
            method: 'get',
            request: {
                body: [
                    { $move: { that: 'there' } },
                    { $tag: 'first', $set: { eyy: 'ohh' } },
                    { $tag: 'third', $unset: ['eyy'] }
                ]
            }
        })

        it('should add a step to the end of the steps array', function() {
            _gap.request('body').add({ $tag: 'fifth', $set: { eyy: 'ohh' } })
            assert.equal(_gap.request('body').get(3).$tag, 'fifth')
        })
        it('should add a step after the step tagged "first"', function() {
            _gap.request('body').add({ $tag: 'second', $set: { eyy: 'ohh' } }, { after: 'first' })
            assert.equal(_gap.request('body').get(2).$tag, 'second')
        })
        it('should add a step before the step tagged "fifth"', function() {
            _gap.request('body').add({ $tag: 'fourth', $set: { eyy: 'ohh' } }, { before: 'fifth' })
            assert.equal(_gap.request('body').get(4).$tag, 'fourth')
        })
    })

    describe('#error', function() {
        describe("'headers'", function() {
            it('should properly format the error response headers', function() {
                let headers = {
                    eyyy: 'ohhhh',
                    eyy: 'ohh',
                    eyyyyyyyyy: 'ohhhhhhhhhh'
                }
                headers = gapRespond.error('headers').process(headers)
                assert.deepStrictEqual(headers, {
                    header1: '3'
                })
            })
        })
        describe("'body'", function() {
            it('should properly format the error response body', function() {
                let body = { cast: '8' }
                body = gapRespond.error('body').process(body)
                assert.deepStrictEqual(body, { cast: 8 })
            })
        })
    })

    describe('#response', function() {
        describe("'headers'", function() {
            it('should properly format the response headers', function() {
                let headers = { 'Content-Type': 'text/plain', 'x-auth': 'Bearer 12345' }
                headers = gapRespond.response('headers').process(headers)
                assert.deepStrictEqual(headers, {
                    'Content-Type': 'text/plain',
                    'Authorization': 'Bearer 12345'
                })
            })
        })
        describe("'body'", function() {
            it('should properly format the response body', function() {
                let body = { code: 404 }
                body = gapRespond.response('body').process(body)
                assert.deepStrictEqual(body, { result: { code: 'NOT FOUND' } })
            })
        })
    })

    describe('#request', function() {
        describe("'headers'", function() {
            it('should properly format the request headers', function() {
                let headers = {
                    header1: 1,
                    header2: 2,
                    header3: 3
                }

                headers = gapRespond.request('headers').process(headers)
                assert.deepStrictEqual(headers, {
                    'Content-Type': 'text/plain',
                    'Authorization': 'Bearer 12345'
                })
            })
        })
        describe("'body'", function() {
            it('should properly format the request body', function() {
                let body = { oldParam: 'useless', name: 'billy billy' }
                body = gapRespond.request('body').process(body)
                assert.deepStrictEqual(body, { name: 'BILLY BILLY', newParam: true })
            })
        })
        describe("'query'", function() {
            it('should properly format the request querystring', function() {
                let query = {
                    user: {
                        name: 'Billy Billy',
                        age: 705
                    }
                }
                query = gapRespond.request('query').process(query)
                assert.deepStrictEqual(query, {
                    age: 705,
                    user: {
                        name: 'Billy Billy',
                        full_name: 'Billy Billy',
                        age: 705
                    }
                })
            })
        })
        describe("'params'", function() {
            it('should properly format the request URL params', function() {
                let params = { test: true }
                params = gapRespond.request('params').process(params)
                assert.deepStrictEqual(params, {
                    two: [
                        {
                            one: {
                                test: true
                            }
                        }
                    ]
                })
            })
        })
    })
})