/**
 * Generic stream for finding template to render and creating rendering context
 * for given file object.
 * For each file in stream, finds matched template, defined as `file.meta.layout`
 * in given `options.layoutsDir`, parses it front matter, creates rendering
 * context and renders with given function
 */
'use strict';

var fs = require('graceful-fs');
var path = require('path');
var through = require('through2');
var extend = require('xtend');
var matter = require('gray-matter');
var Context = require('./context');

var defaultOptions = {
	cwd: process.cwd(),
	layoutsDir: './layouts',
	render: function(file, callback) {
		return callback(null, file);
	}
};

module.exports = function(fn, options) {
	if (typeof options === 'object') {
		options = fn;
		fn = null;
	}

	options = extend(defaultOptions, options || {});
	fn = fn || options.render;
	var templateCache = {};
	var layoutsDir = path.resolve(options.cwd, options.layoutsDir);

	return through.obj(function(file, enc, next) {
		if (!file.meta || !file.meta.layout) {
			return next(null, file);
		}

		var render = function(file, templateData) {
			console.log('rendering', file.relative);
			return fn(templateData.content, new Context(file, templateData), next);
		};

		var layout = file.meta.layout;
		if (layout in templateCache) {
			return render(file, templateCache[layout]);
		}

		var layoutPath = path.resolve(options.layoutsDir, layout);
		resolveTemplate(layoutPath, function(err, filePath, content, meta) {
			templateCache[layout] = {
				file: filePath,
				content: content,
				meta: meta
			};
			render(file, templateCache[layout]);
		});
	});
};

function resolveTemplate(layout, callback) {
	var dir = path.dirname(layout);
	var fileName = path.basename(layout);
	fs.readdir(dir, function(err, list) {
		if (err) {
			return callback(err);
		}

		// locate file that matches given layout
		var matchedFile = list.filter(function(item) {
			return item.split('.')[0] === fileName;
		})[0];

		if (!matchedFile) {
			return callback(new Error('Unable to find "' + file.meta.layout + '" layout in ' + basePath));
		}

		// read and parse file contents
		var filePath = path.join(dir, matchedFile);
		fs.readFile(filePath, 'utf8', function(err, contents) {
			if (err) {
				return callback(err);
			}

			var meta;
			try {
				meta = matter(contents);
			} catch (e) {
				return callback(e);
			}	

			callback(null, filePath, meta.content, meta.data);
		});
	});
}

class Context {
	constructor(file, templateData) {
		this.document = extend(file.meta);
		this.template = extend(templateData.meta, {
			templateFile: templateData.file
		});
		this.navigation = file.navigation;
		this.content = file.contents.toString();
		this.url = file.navigation.current().url;
		this.path = file.relative;
		this.absPath = file.path;
	}
}