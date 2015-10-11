/**
 * Stream for initial processing of files: parses front matter and
 * creates navigation for files that create file structure
 */
'use strict';
var through = require('through2');
var extend = require('xtend');
var matter = require('gray-matter');
var navigation = require('./navigation');

var defaultOptions = {
	include: /\.html?\b/
};

module.exports = function(options) {
	var pages = [];
	options = extend(defaultOptions, options || {});
	return through.obj(function(file, enc, next) {
		if (!matches(file, options.include) || file.isNull()) {
			return next(null, file);
		}

		readFile(file, function(err, contents) {
			if (err) {
				return next(err);
			}

			var meta;
			try {
				meta = matter(contents.toString());
			} catch (e) {
				return next(e);
			}

			file.contents = new Buffer(meta.content);
			file.meta = meta.data;
			pages.push(file);
			next();
		});
	}, function(next) {
		var nav = navigation(pages, options);
		pages.forEach(function(page) {
			page.navigation = nav.forUrl(page.relative);
			this.push(page);
		}, this);
		next();
	});
};

function matches(file, matcher) {
	if (typeof matcher === 'function') {
		return matcher(file);
	}

	if (matcher instanceof RegExp) {
		return matcher.test(file.relative);
	}

	return file.relative == matcher;
}

function readFile(file, callback) {
	if (file.isBuffer()) {
		return callback(null, file.contents);
	}

	if (file.isStream()) {
		var chunks = [], len = 0;
		return file.contents.pipe(through(function(chunk, enc, next) {
			chunks.push(chunk);
			len += chunk.length;
			next();
		}, function(next) {
			this.removeListener('error', callback);
			next();
			callback(null, new Buffer(chunks, len))
		})).once('error', callback);
	}

	callback(new Error('Unknown file type: ' + file.path));
}