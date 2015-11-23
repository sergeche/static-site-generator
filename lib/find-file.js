/**
 * Finds file with name of `name` and arbitrary extension in given `dir` 
 * folder. When found, automatically reads front matter from it.
 * @param  {String} name   Name of file
 * @param  {String} dir    Lookup folder
 * @param  {Object} cache  If provided, uses given object for storing/retreiving 
 * file references
 * @return {Promise}
 */
'use strict';

var vfs = require('vinyl-fs');
var path = require('path');
var through = require('through2');
var debug = require('debug')('ssg:find-file');
var meta = require('./meta');

module.exports = function(name, dir, cache) {
	dir = dir || process.cwd();
	return new Promise(function(resolve, reject) {
		debug('looking for "%s" file', name);
		var cacheKey = path.join(dir, name);

		if (cache && cacheKey in cache) {
			debug('use cached file for "%s"', name);
			let cachedFile = cache[cacheKey];
			// restore file path in order to render properly
			cachedFile.path = cachedFile.history[0];
			return resolve(cachedFile);
		}

		var found = false;
		vfs.src(name + '.*', {cwd: dir})
		.pipe(through.obj(function(file, enc, next) {
			if (!found) {
				found = true;
				meta(file).then(function(file) {
					debug('use %s for "%s" file search', file.relative, name);
					if (cache) {
						cache[cacheKey] = file;
					}
					resolve(file);
				}, reject);
				this.end();
				next();
			}
		}, function(next) {
			if (!found) {
				debug('file "%s" not found', name);
				var err = new Error(`Unable to find "${name}" file in ${dir}`);
				err.code = 'ENOTFOUND';
				reject(err);
			}
			next();
		}));
	});
};