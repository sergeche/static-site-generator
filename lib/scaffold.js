/**
 * Stream for initial processing of files: parses front matter and
 * creates navigation for files that create file structure
 */
'use strict';
var through = require('through2');
var extend = require('xtend');
var debug = require('debug')('ssg:scaffold');
var meta = require('./meta');
var navigation = require('./navigation');
var render = require('./render');

var defaultOptions = {
	pages: /\.html?\b/
};

module.exports = function(options) {
	var pages = [];
	options = extend(defaultOptions, options || {}, {
		nameResolver: render.nameResolver(options)
	});
	return through.obj(function(file, enc, next) {
		if (!matches(file, options.pages) || file.isNull()) {
			return next(null, file);
		}

		meta(file).then(function(file) {
			pages.push(file);
			next();
		}, next);
	}, function(next) {
		debug('pages found: %d', pages.length);
		var nav = navigation(pages, options);
		pages.forEach(function(page) {
			debug('generate navigation for %s', page.relative);
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