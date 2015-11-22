'use strict';

var assert = require('assert');
var path = require('path');
var vfs = require('vinyl-fs');
var through = require('through2');
var marked = require('marked');
var eco = require('eco');
var scaffold = require('../lib/scaffold');
var render = require('../lib/render');

describe('Render', function() {
	var renderer = {
		'md': function(ctx) {
			return new Buffer(marked(ctx.content.toString()));
		},
		'eco': function(ctx, file) {
			return new Buffer(eco.render(file.contents.toString(), ctx));
		}
	};

	it('markdown', function(done) {
		var processed = false;

		vfs.src('input/*.md', {cwd: __dirname})
		.pipe(render({renderer})).once('error', done)
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(/<h1(\s|>)/.test(contents));
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('finish', function() {
			assert(processed);
			done();
		});
	});

	it('eco (with custom context)', function(done) {
		var processed = false;
		var context = {
			foo: function(str) {
				return str + '???';
			}
		};

		vfs.src('input/sample.html.eco', {cwd: __dirname})
		.pipe(scaffold())
		.pipe(render({renderer, context})).once('error', done)
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(contents.indexOf('<h1>Hello world!</h1>') !== -1);
			assert(contents.indexOf('bar???') !== -1);
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('finish', function() {
			assert(processed);
			done();
		});
	});

	it('with template', function(done) {
		var processed = false;

		vfs.src('input/with-layout.html.eco', {cwd: __dirname})
		.pipe(render({renderer, cwd: __dirname})).once('error', done)
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(~contents.indexOf('<html'), '<html> tag from base template');
			assert(~contents.indexOf('<title>Page title</title>'), 'page title from document');
			assert(~contents.indexOf('<h1>Layout header</h1>'), 'header from "page" template');
			assert(~contents.indexOf('<div class="wrapper">'), 'content wrapper');
			assert(~contents.indexOf('<h2>Hello world</h2>'), 'document content');
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('finish', function() {
			assert(processed);
			done();
		});
	});

	it('post-processors', function(done) {
		var processed = false;

		vfs.src('input/with-post-processor.html.eco', {cwd: __dirname})
		.pipe(render({
			renderer, 
			cwd: __dirname,
			context: {
				postProcess(data) {
					return render.postprocess(function() {
						return new Promise(function(resolve) {
							setTimeout(function() {
								resolve(data = '{{' + data + '}}');
							}, 10);
						});
					});
				}
			}
		})).once('error', done)
		.pipe(through.obj(function(file, enc, next) {
			var contents = file.contents.toString();
			assert(~contents.indexOf('{{foo}}'), 'async render complete');
			assert.equal(path.extname(file.path), '.html');
			processed = true;
			next(null, file);
		}))
		.once('finish', function() {
			assert(processed);
			done();
		});
	});
});