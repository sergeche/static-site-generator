'use strict';

var path = require('path');
var vfs = require('vinyl-fs');
var extend = require('xtend');
var debug = require('debug')('ssg:main');
var combine = require('stream-combiner2');
var scaffold = require('./lib/scaffold');
var render = require('./lib/render');

var defaultOptions = {
	cwd: process.cwd()
};

module.exports = function(src, dest, options) {
	options = opt(options);

	return srcStream(src, options)
	.pipe(generate(options))
	.pipe(destStream(dest, options));
};

var srcStream = module.exports.src = function(patterns, options) {
	return vfs.src(patterns, opt(options));
};

var destStream = module.exports.dest = function(path, options) {
	return vfs.dest(path, opt(options));
};

/**
 * Main site generator stream
 * @param  {Object} options
 * @return {stream.Transform}
 */
var generate = module.exports.generate = function(options) {
	options = options || {};
	debug('generating site');
	return combine.obj(
		scaffold(options),
		render(options)
	);
};

var opt = function(options) {
	return extend(defaultOptions, options || {});
}

module.exports.scaffold = scaffold;
module.exports.render = render;