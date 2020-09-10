'use strict';

const crypto = require('crypto');


/**
 * Used CryptoJS to generate a random string
 * 
 * @param {number} [length=10] Fixed length of the resulting string, including any prefix
 * @param {string} [prefix]
 * @param {string} [charset=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789] character set for the token
 * 
 * @returns {string}
 */
module.exports.randomString = function(length = 32, prefix = '', charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
	let result = String(prefix);
	let bytes = crypto.randomBytes(length - result.length);
	let cursor = 0;
	for (let byte of bytes) {
		cursor += byte;
		result += charset[cursor % charset.length]
	}
	return result;
}