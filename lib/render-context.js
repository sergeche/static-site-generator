'use strict';
var path = require('path');
var debug = require('debug')('ssg:render-ctx');

module.exports = class RenderContext {
	constructor(renderers) {
		this._renderers = renderers;
	}

	render(file, ctx) {
		debug('rendering %s', file.relative);
		var self = this;
		return new Promise(function(resolve, reject) {
			var basename = path.basename(file.relative);
			var next = function(ctx) {
				var ext = path.extname(basename);
				if (!ext) { // nothing to render anymore
					return resolve(ctx.content);
				}

				basename = basename.slice(0, -ext.length);
				self.renderExtension(ext, file, ctx)
				.then(function(content) {
					// trim extension, except last one
					if (path.extname(basename)) {
						file.path = file.path.slice(0, -ext.length);
					}
					next(ctx.clone({content}));
				})
				.catch(function(err) {
					if (err && err.code === 'ENORENDERER') {
						debug('no matched renderer for "%s" extension', ext);
						// No matched renderer. If there are more extensions 
						// in file, warn user
						if (path.extname(basename)) {
							console.warn('No renderer for "%s" extension when rendering %s', ext, file.relative);
						}
						return next(ctx);
					}
					reject(err);
				});
			};

			next(ctx);
		});
	}

	renderExtension(ext, file, ctx) {
		debug('applying %s renderer to %s', ext, file.relative);
		var renderer = this._renderers[ext.slice(1)];
		if (typeof renderer !== 'function') {
			var err = new Error(`No renderer or renderer is not a function for "${ext}" extension`);
			err.code = 'ENORENDERER';
			return Promise.reject(err);
		}

		var self = this;
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
			return ctx.applyPostProcessors(self, content);
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
};