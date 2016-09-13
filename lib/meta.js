/**
 * Reads front matter (meta data) for given Vinyl file object and stores it
 * in file
 */
'use strict';

const through = require('through2');
const matter = require('gray-matter');
const utils = require('./utils');

const fmDecl = new Buffer('---');
const defaultOptions = {
	indexFiles: /^index\.\w+/
};

module.exports = function(file, options) {
	options = Object.assign({}, defaultOptions, options);
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

			// create document url
			let url = file.relative;
			const extensions = utils.getExtensions(url);
			if (extensions.length) {
				url = url.slice(0, -extensions.join('').length) + extensions[0];
			}

			file.meta.url = utils.makeUrl(url, options.indexFiles);
		}
		return file;
	});
};

function readFile(file) {
	return new Promise(function(resolve, reject) {
		if (file.isBuffer()) {
			return resolve(file.contents);
		}

		if (file.isStream()) {
			let chunks = [], len = 0;

			const reset = () => {
				file.contents.removeListener('data', onData);
				file.contents.removeListener('end', onEnd);
				file.contents.removeListener('error', onError);
			};

			const onData = (chunk, enc, next) => {
				chunks.push(chunk);
				len += chunk.length;
			};

			const onEnd = () => {
				reset();
				resolve(Buffer.concat(chunks, len));
			};

			const onError = err => {
				reset();
				reject(err);
			};

			return file.contents
			.on('data', onData)
			.on('end', onEnd)
			.on('error', onError)
			.resume();
		}

		reject(new Error('Unknown file type: ' + file.path));
	});
}
