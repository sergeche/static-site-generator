'use strict';

var path = require('path');
var vfs = require('vinyl-fs');
var extend = require('xtend');
var combine = require('stream-combiner');
var scaffold = require('./lib/scaffold');
var render = require('./lib/render');
var proc = require('./lib/process');

var defaultOptions = {
	cwd: process.cwd()
};

module.exports = function(src, dest, options) {
	options = extend(defaultOptions, options || {});

	return vfs.src(src, options)
	.pipe(generate(options))
	.pipe(vfs.dest(dest, options));
};

/**
 * Main site generator stream
 * @param  {Object} options
 * @return {stream.Transform}
 */
var generate = module.exports.generate = function(options) {
	options = options || {};

	var pipeline = [scaffold(options.navigation)];

	if (options.process) {
		Object.keys(options.process).forEach(function(ext) {
			pipeline.push(proc(ext, options.process[ext]));
		});
	}

	pipeline.push(render(options.render));

	return combine(pipeline);
};

module.exports.scaffold = scaffold;
module.exports.render = render;
module.exports.process = proc;