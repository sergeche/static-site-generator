/**
 * A “partial” implementation for static-site-generator:
 * provides context function for rendering given file references in page
 */
'use strict';

var vfs = require('vinyl-fs');
var path = require('path');
var extend = require('xtend');
var through = require('through2');
var findFile = require('./find-file');

module.exports = function(options) {
	options = extend({
		cwd: process.cwd(),
		partialsDir: 'partials', // relative to `cwd`
	}, options || {});

	var lookupPath = path.resolve(options.cwd, options.partialsDir);
	// Cache object used to speed-up look-ups
	// TODO must be emptied in server mode
	var partialsCache = {};

	return function(fileName, data) {
		var ctx = this.clone(data || {});
		return this.postprocess(function(renderCtx) {
			return findFile(fileName, lookupPath, partialsCache)
			.then(function(file) {
				ctx.content = file.contents.toString();
				return renderCtx.render(file, ctx);
			});
		});
	};
};