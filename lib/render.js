/**
 * Renders given Vinyl file: runs processing on file, then takes file
 * from `layout` meta property, renders it, takes `layout` again and so on.
 * Initially, it builds a chain of all files to render and creates a shared
 * rendering context for them
 */
'use strict';

var path = require('path');
var through = require('through2');
var extend = require('xtend');
var debug = require('debug')('ssg:render');
var meta = require('./meta');
var findFile = require('./find-file');
var partial = require('./partial');
var Context = require('./context');
var RenderContext = require('./render-context');

var defaultOptions = {
	cwd: process.cwd(),
	layoutsDir: './layouts', // relative to `cwd`

	// Hash of custom renderers used for rendering in current session.
	// Key is a file extension (use `,` or `|` to enumerate extensions) and
	// value is a rendering function
	renderer: null,

	// Object; additional data to pass to rendering context
	context: null
};

var globalRenderes = {};

module.exports = function(options) {
	options = extend(defaultOptions, options || {}, {
		// Internal property used for layout lookups
		// TODO must be emptied when using server mode
		_layoutCache: {}
	});
	options.context = extend({
		partial: partial(options)
	}, options.context || {});

	var renderers = getRenderers(options);
	debug('using renderers: %o', Object.keys(renderers));

	return through.obj(function(file, enc, next) {
		meta(file)
		.then(function(file) {
			debug('build render chain for %s', file.relative);
			return buildRenderChain(file, options);
		})
		.then(function(chain) {
			debug('chain length for %s: %d', file.relative, chain.length);
			return renderChain(chain, renderers, options.context);
		})
		.then(function(contents) {
			debug('rendering of %s complete', file.relative);
			file.contents = contents;
			next(null, file);
		})
		.catch(next);
	});
};

var register = module.exports.register = function(ext, fn, dest) {
	if (typeof ext === 'string') {
		ext = ext.split(/[,|]/g).map(function(ext) {
			return ext.trim();
		});
	}

	return ext.reduce(function(renderers, e) {
		renderers[e] = fn;
		return renderers;
	}, dest || globalRenderes);
};

/**
 * Completely renders a single file: takes its extensions and applies
 * renderer that matches this extension. The rendered content is returned
 * as promise result
 * @param   {Vinyl}   file   File to render
 * @param   {Context} ctx    File rendering context
 * @param   {Object}  renderers Map of available renderers
 * @returns {Promise}
 */
var render = module.exports.render = function(file, ctx, renderers) {
	var renderCtx = new RenderContext(renderers || globalRenderes);
	return renderCtx.render(file, ctx);
};

/**
 * Returns a function that returns rendered name for given file name.
 * This is mostly a hack to match renderer behavior, but I can’t find a better
 * idea about how to get final page name before it is rendered.
 * @param  {Object} options Object with renderer options, the same as passed
 * to main function
 * @return {Function}
 */
module.exports.nameResolver = function(options) {
	var renderers = Object.keys(getRenderers(options));
	return function(fileName) {
		var ext;
		while (ext = path.extname(fileName)) {
			if (renderers.indexOf(ext.slice(1)) !== -1) {
				fileName = fileName.slice(0, -ext.length);
			} else {
				break;
			}
		}

		return fileName;
	};
};

function getRenderers(options) {
	var renderers = extend(globalRenderes);

	// register runtime renderers
	if (options && options.renderer) {
		Object.keys(options.renderer).forEach(function(key) {
			register(key, options.renderer[key], renderers);
		});
	}

	return renderers;
}

/**
 * Renders given rendering chain: applies renderers for each file in turn
 * and returns final content as promise result
 * @param  {Array}  chain 
 * @param  {Object} renderers Map of available renderers
 * @param  {Object} data Additional data for context object 
 * @return {Promise}
 */
function renderChain(chain, renderers, data) {
	return new Promise(function(resolve, reject) {
		var ctx = new Context(chain[0], data);
		// combine meta data
		ctx.meta = chain.map(function(file) {
			return file.meta;
		}).reduceRight(function(full, cur) {
			return extend(full, cur);
		}, {});

		chain = chain.slice(0);

		var next = function(ctx) {
			if (!chain.length) {
				return resolve(ctx.content);
			}

			var file = chain.shift();
			render(file, ctx, renderers)
			.then(function(content) {
				next(ctx.clone({content}));
			})
			.catch(reject);
		};
		next(ctx);
	});
}

/**
 * Builds a rendering chain for given file. A rendering chain is an array of
 * current file and its parent layout that must be rendered to get the desired 
 * result.
 * @param   {Vinyl}  originalFile 
 * @param   {Object} options
 * @returns {Promise}
 */
function buildRenderChain(originalFile, options) {
	return new Promise(function(resolve, reject) {
		var recursionGuard = [];
		var renderChain = [];
		var layoutsDir = path.resolve(options.cwd, options.layoutsDir);

		var next = function(file) {
			renderChain.push(file);
			recursionGuard.push(file.path);

			if (file.meta && file.meta.layout) {
				findFile(file.meta.layout, layoutsDir, options._layoutCache)
				.then(function(layoutFile) {
					if (recursionGuard.indexOf(layoutFile.path) !== -1) {
						// referencing file already in render chain, looks like a recursion
						var err = new Error(`Error while building render chain for ${originalFile.relative}: it contains recursive reference to ${layoutFile.relative} layout`);
						err.code = 'ERECURSIVE';
						err.originalFile = originalFile.path;
						return reject(err);
					}
					
					next(layoutFile);
				}, function(err) {
					err.message = `Error while rendering ${file.relative}:\n${err.message}`;
					reject(err);
				});
			} else {
				// no more `layout` references: the chain is complete
				resolve(renderChain);
			}
		};

		next(originalFile);
	});
}