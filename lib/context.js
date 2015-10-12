/**
 * A file rendering context, used for file processing and applying templates
 */

'use strict';

var extend = require('xtend');
var utils = require('./utils');

module.exports = class Context {
	constructor(file, data) {
		this._file = file;
		this.document = extend(file.meta || {});
		this.navigation = file.navigation;
		this.content = file.contents;
		this.url = utils.makeUrl(file.relative);
		this.path = file.relative;
		this.absPath = file.path;
		copy(this, data);
	}

	clone(addon) {
		return copy(new Context(this._file), this, addon);
	}

	toJSON() {
		var self = this;
		return Object.keys(this).reduce(function(json, key) {
			if (key !== '_file') {
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
				to[key] = from[key];
			});
		}
	}
	
	return to;
}