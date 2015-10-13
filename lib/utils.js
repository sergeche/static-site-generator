'use strict';

var path = require('path');

module.exports.makeUrl = function(filePath, indexPatterns, nameResolver) {
	filePath = filePath.replace(/\\/g, '/');
	if (filePath[0] !== '/') {
		filePath = '/' + filePath;
	}

	if (typeof nameResolver === 'function') {
		filePath = nameResolver(filePath);
	}

	if (isIndex(filePath, indexPatterns)) {
		filePath = path.dirname(filePath);
		if (filePath[filePath.length - 1] !== '/') {
			filePath += '/';
		}
	}
	return filePath;
};

var flatten = module.exports.flatten = function(arr) {
	return arr.reduce(function(result, item) {
		if (Array.isArray(item)) {
			return result.concat(flatten(item));
		} else {
			result.push(item);
			return result;
		}
	}, []);
};

var isIndex = module.exports.isIndex = function(filePath, indexPatterns) {
	if (!indexPatterns) {
		return false;
	}

	var baseName = path.basename(filePath);
	if (!Array.isArray(indexPatterns)) {
		indexPatterns = [indexPatterns];
	}

	return indexPatterns.some(function(pattern) {
		return pattern instanceof RegExp ? pattern.test(baseName) : baseName == pattern;
	});
};