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
var postProcessId = 0;
var postProcessTokens = {};

module.exports = function(options) {
	options = extend(defaultOptions, options || {}, {
		// Internal property used for layout lookups
		// TODO must be emptied when using server mode
		_layoutCache: {}
	});
	options.context = extend({
		partial: partial(module.exports, options)
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
	var basename = path.basename(file.relative);
	renderers = renderers || globalRenderes;
	debug('rendering %s', file.relative);

	return new Promise(function(resolve, reject) {
		var next = function(ctx) {
			var ext = path.extname(basename);
			if (!ext) {
				// nothing to render
				return resolve(ctx.content);
			}

			debug('rendering %s extension of %s', ext, file.relative);

			basename = basename.slice(0, -ext.length);
			var name = ext.slice(1);
			if (!renderers[name]) {
				debug('mo matched renderer for "%s" extension', ext);
				// No matched renderer. If there are more extensions in file, 
				// warn user
				if (path.extname(basename)) {
					console.warn('No renderer for "%s" extension when rendering %s', ext, file.relative);
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

/**
 * Registers a post-processor for rendering pass.
 * Most renderes works in a sync manner, which is a problem if developers
 * try to re-use parts of site generator, which are mostly async. This method
 * generates a unique token for given function, which will be automatically
 * replaced with function’s Promise result after render path
 * @param  {Function} fn A Promise factoty: the Promise must return a content
 * that will be placed instead of token in current source
 * @return {String}      Unique post-process token: put it into a source code
 * and it will be replaced after render path
 */
module.exports.postprocess = function(fn) {
	var token = `[[ssg:post-process-token:${postProcessId++}]]`;
	postProcessTokens[token] = fn;
	return token;
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

function applyRenderer(file, ctx, renderer, ext) {
	debug('applying %s renderer to %s', ext, file.relative);
	return new Promise(function(resolve, reject) {
		if (renderer.length > 2) {
			// async function, expects callback
			debug('%s renderer is async, waiting for callback');
			renderer(ctx, file, function(err, content) {
				err ? reject(err) : resolve(content);
			});
		} else {
			// sync function or promise
			var res = renderer(ctx, file);
			if (res instanceof Promise) {
				debug('%s renderer is async, waiting for promise');
				return res;
			}
			debug('%s renderer is sync', ext);
			resolve(res);
		}
	})
	.then(function(content) {
		if (!Buffer.isBuffer(content)) {
			return Promise.reject(new Error(`The content returned from "${ext}" renderer must be buffer`));
		}
		return content;
	}, function(err) {
		// create more understandable error message 
		err.message = `Error while rendering ${file.relative} file with "${ext}" renderer:\n${err.message}`;
		return Promise.reject(err);
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
			render(file, ctx, renderers)
			.then(function(content) {
				return applyPostProcessors(content, ctx);
			})
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

function applyPostProcessors(content, ctx) {
	var tokens = Object.keys(postProcessTokens);
	return new Promise(function(resolve, reject) {
		var next = function(cn) {
			if (!tokens.length) {
				return resolve(new Buffer(cn));
			}

			replacePostProcessorToken(tokens.shift(), cn, ctx)
			.then(next, reject);
		};
		next(content);
	});
}

function replacePostProcessorToken(token, content, ctx) {
	debug('replacing post-process token %s', token);
	return new Promise(function(resolve, reject) {
		var next = function(cn) {
			var ix = cn.indexOf(token);
			if (ix === -1) {
				delete postProcessTokens[token];
				return resolve(cn);
			}

			if (!postProcessTokens[token]) {
				return reject(new Error('Unknown post-process token: ' + token));
			}

			postProcessTokens[token](ctx)
			.then(function(chunk) {
				next(cn.slice(0, ix) + String(chunk) + cn.slice(ix + token.length));
			}, reject);
		};

		next(content);
	});
}