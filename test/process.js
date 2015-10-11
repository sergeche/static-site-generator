'use strict';

var assert = require('assert');
var path = require('path');
var vfs = require('vinyl-fs');
var through = require('through2');
var marked = require('marked');
var eco = require('eco');
var scaffold = require('../lib/scaffold');
var proc = require('../lib/process');

describe('Process', function() {
	it('markdown', function(done) {
		var processed = false;

		vfs.src('input/*.md', {cwd: __dirname})
		.pipe(proc('md', function(file) {
			return marked(file.contents.toString());
		}))
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(/<h1(\s|>)/.test(contents));
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('error', done)
		.once('finish', function() {
			assert(processed);
			done();
		});
	});

	it('eco', function(done) {
		var processed = false;
		var render = function(file, ctx) {
			return eco.render(file.contents.toString(), ctx);
		};
		var addon = {
			foo: function(str) {
				return str + '???';
			}
		};

		vfs.src('input/*.eco', {cwd: __dirname})
		.pipe(scaffold())
		.pipe(proc('eco', render, addon))
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(contents.indexOf('<h1>Hello world!</h1>') !== -1);
			assert(contents.indexOf('bar???') !== -1);
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('error', done)
		.once('finish', function() {
			assert(processed);
			done();
		});
	});
});