/**
 * Reads front matter (meta data) for given Vinyl file object and stores it
 * in file 
 */
'use strict';

var through = require('through2');
var matter = require('gray-matter');

module.exports = function(file) {
	return readFile(file).then(function(contents) {
		if (!file.meta) {
			var meta = matter(contents.toString());
			file.contents = new Buffer(meta.content);
			file.meta = meta.data;
		}
		return file;
	});
};

function readFile(file) {
	return new Promise(function(resolve, reject) {
		if (file.isBuffer()) {
			return resolve(file.contents);
		} else if (file.isStream()) {
			var chunks = [], len = 0;
			file.contents.pipe(through(function(chunk, enc, next) {
				chunks.push(chunk);
				len += chunk.length;
				next();
			}, function(next) {
				this.removeListener('error', reject);
				next();
				resolve(new Buffer(chunks, len))
			})).once('error', reject);
		} else {
			reject(new Error('Unknown file type: ' + file.path));
		}
	});
}