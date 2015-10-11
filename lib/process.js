/**
 * Stream for processing file with given extension. When file is rendered,
 * extension is removed from file name
 */
'use strict';

var path = require('path');
var through = require('through2');
var Context = require('./context');

module.exports = function(ext, fn, options) {
	options = options || {};
	if (typeof ext === 'string') {
		ext = ext.split(/[,|]/g).map(function(ext) {
			return ext.trim();
		});
	}

	return through.obj(function(file, enc, next) {
		var fileExt = path.extname(file.relative);
		if (!matchesExtension(fileExt.slice(1), ext)) {
			if (hasMoreExtensions(file.relative)) {
				// there’s another extension, warn that current extension
				// renderer is missing
				console.warn('No renderer for "%s" extension', fileExt);
			}
			return next(null, file);
		}

		var complete = function(err, contents) {
			if (err) {
				return next(err);
			}

			if (typeof contents === 'string') {
				contents = new Buffer(contents);
			}
			file.contents = contents;
			if (hasMoreExtensions(file.path)) {
				file.path = cutExtension(file.path);
			}
			next(null, file);
		};

		var ctx = new Context(file, options);
		if (fn.length > 2) {
			// async function
			fn.call(this, file, ctx, complete);
		} else {
			// sync function
			try {
				complete(null, fn.call(this, file, ctx));
			} catch(e) {
				complete(e);
			}
		}
	});
};

function matchesExtension(ext, matcher) {
	if (Array.isArray(matcher)) {
		return matcher.indexOf(ext) !== -1;
	}

	if (matcher instanceof RegExp) {
		return matcher.text(ext);
	}

	return ext == matcher;
}

function hasMoreExtensions(filePath) {
	filePath = cutExtension(filePath);
	return !!path.extname(filePath);
}

function cutExtension(filePath) {
	var ext = path.extname(filePath);
	return ext ? filePath.slice(0, -ext.length) : filePath;
}