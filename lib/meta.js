/**
 * Reads front matter (meta data) for given Vinyl file object and stores it
 * in file 
 */
'use strict';

var through = require('through2');
var matter = require('gray-matter');

var fmDecl = new Buffer('---');

module.exports = function(file) {
	return readFile(file).then(function(contents) {
		if (!file.meta) {
			// look-up for first three bytes: if it’s not a `---`
			// (front matter declaration start), don’t even try to
			// parse it because it will corrupt binary files
			if (contents.length > 3 && contents.slice(0, 3).equals(fmDecl)) {
				var meta = matter(contents.toString());
				file.contents = new Buffer(meta.content);
				file.meta = meta.data;
			} else {
				file.contents = contents;
				file.meta = {};
			}
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