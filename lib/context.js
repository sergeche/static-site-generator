/**
 * A file rendering context, used for file processing and applying templates
 */

'use strict';

var extend = require('xtend');
var debug = require('debug')('ssg:context');
var utils = require('./utils');

module.exports = class Context {
	constructor(file, data) {
		this._file = file;
		this._postProcessId = 0;
		this._postProcessTokens = {};

		this.document = extend(file.meta || {});
		this.navigation = file.navigation;
		this.content = file.contents;
		this.url = utils.makeUrl(file.relative);
		this.path = file.relative;
		this.absPath = file.path;

		copy(this, file.context, data);
	}

	clone(addon) {
		return copy(new Context(this._file), this, addon);
	}

	postprocess(fn) {
		var token = `[[ssg:post-process-token:${this._postProcessId++}]]`;
		this._postProcessTokens[token] = fn;
		return token;
	}

	applyPostProcessors(renderCtx, content) {
		var tokens = Object.keys(this._postProcessTokens);
		var self = this;
		return new Promise(function(resolve, reject) {
			var next = function(cn) {
				if (!tokens.length) {
					return resolve(new Buffer(cn));
				}

				var token = tokens.shift();
				replacePostProcessorToken(cn, token, self._postProcessTokens[token], renderCtx)
				.then(next, reject);
				delete self._postProcessTokens[token];
			};
			next(content != null ? content : this.content);
		});
	}

	toJSON() {
		var self = this;
		return Object.keys(this).reduce(function(json, key) {
			if (key[0] !== '_') {
				json[key] = self[key];
			}
			return json;
		}, {});
	}
};

function copy(to) {
	for (var i = 1, il = arguments.length, from; i < il; i++) {
		from = arguments[i];
		if (from && typeof from === 'object') {
			Object.keys(from).forEach(function(key) {
				if (key[0] !== '_') {
					to[key] = from[key];
				}
			});
		}
	}
	
	return to;
}

function replacePostProcessorToken(content, token, replacer, renderCtx) {
	debug('replacing post-process token %s', token);
	return new Promise(function(resolve, reject) {
		var next = function(cn) {
			var ix = cn.indexOf(token);
			if (ix === -1) {
				return resolve(cn);
			}

			if (typeof replacer !== 'function') {
				return reject(new Error('Post-process replacer must be a function'));
			}

			replacer(renderCtx).then(function(chunk) {
				next(cn.slice(0, ix) + String(chunk) + cn.slice(ix + token.length));
			}, reject);
		};

		next(content);
	});
}