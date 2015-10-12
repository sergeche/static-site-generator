/**
 * Renders given Vinyl file: runs processing on file, then takes file
 * from `layout` meta property, renders it, takes `layout` again and so on.
 * Initially, it builds a chain of all files to render and creates a shared
 * rendering context for them
 */
'use strict';

var fs = require('graceful-fs');
var path = require('path');
var vfs = require('vinyl-fs');
var through = require('through2');
var extend = require('xtend');
var meta = require('./meta');
var Context = require('./context');

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
	options = extend(defaultOptions, options || {});
	var renderers = extend(globalRenderes);

	// register runtime renderers
	if (options.renderer) {
		Object.keys(options.renderer).forEach(function(key) {
			register(key, options.renderer[key], renderers);
		});
	}

	return through.obj(function(file, enc, next) {
		meta(file)
		.then(function(file) {
			return buildRenderChain(file, options);
		})
		.then(function(chain) {
			return renderChain(chain, renderers, options.context);
		})
		.then(function(contents) {
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
function render(file, ctx, renderers) {
	var basename = path.basename(file.relative);

	return new Promise(function(resolve, reject) {
		var next = function(ctx) {
			var ext = path.extname(basename);
			if (!ext) {
				// nothing to render
				return resolve(ctx.content);
			}

			basename = basename.slice(0, -ext.length);
			var name = ext.slice(1);
			if (!renderers[name]) {
				// No matched renderer. If there are more extensions in file, 
				// warn user
				if (path.extname(basename)) {
					console.warn('No renderer for "%s" extension', ext);
				}
				return resolve(ctx.content);
			}

			applyRenderer(file, ctx, renderers[name], ext)
			.then(function(content) {
				// trim extension, except last one
				if (path.extname(basename)) {
					file.path = file.path.slice(0, -ext.length);
				}
				next(ctx.clone({content}));
			})
			.catch(reject);
		};

		next(ctx);
	});
}

function applyRenderer(file, ctx, renderer, ext) {
	return new Promise(function(resolve, reject) {
		if (renderer.length > 2) {
			// async function, expects callback
			renderer(ctx, file, function(err, content) {
				err ? reject(err) : resolve(content);
			});
		} else {
			// sync function or promise
			var res = renderer(ctx, file);
			if (res instanceof Promise) {
				return res;
			}
			resolve(res);
		}
	})
	.then(function(content) {
		if (!Buffer.isBuffer(content)) {
			throw new Error(`The content returned from "${ext}" renderer must be buffer`);
		}
		return content;
	});
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
			render(file, ctx, renderers).then(function(content) {
				next(ctx.clone({content}));
			}, reject);
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
				getLayoutFile(layoutsDir, file.meta.layout)
				.then(function(layoutFile) {
					if (recursionGuard.indexOf(layoutFile.path) !== -1) {
						// referencing file already in render chain, looks like a recursion
						var err = new Error(`Error while rendering ${originalFile.path}: it contains recursive reference to ${layoutFile.path} layout`);
						err.code = 'ERECURSIVE';
						err.originalFile = originalFile.path;
						return reject(err);
					}
					
					next(layoutFile);
				}).catch(reject);
			} else {
				// no more `layout` references: the chain is complete
				resolve(renderChain);
			}
		};

		next(originalFile);
	});
}

function getLayoutFile(base, layout) {
	return new Promise(function(resolve, reject) {
		// TODO add caching
		vfs.src(layout + '.*', {cwd: base})
		.pipe(through.obj(function(file, enc, next) {
			meta(file).then(function(file) {
				resolve(file);
				next();
			});
		}, function(next) {
			next();
			var err = new Error(`Unable to file layout "${layout}" in ${base}`);
			err.code = 'ENOTFOUND';
			reject(err);
		}));
	});
}