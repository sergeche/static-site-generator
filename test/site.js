'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var marked = require('marked');
var eco = require('eco');
var ssg = require('../');

describe('Site generator', function() {
	var config = {
		cwd: __dirname,
		renderer: {
			'md': function(ctx) {
				return new Buffer(marked(ctx.content.toString()));
			},
			'eco': function(ctx, file) {
				return new Buffer(eco.render(file.contents.toString(), ctx));
			}
		},
		context: {
			foo(str) {
				return str + '???';
			},
			postProcess() {
				return '';
			}
		}
	};

	var file = function(name) {
		return fs.readFileSync(path.join(__dirname, name), 'utf8');
	};

	it('generate', function(done) {
		ssg('input/**/*.*', './out', config)
		.on('error', done)
		.on('finish', function() {
			var f = file('out/about/contacts/index.html');
			assert(~f.indexOf('<em class="navigation-label">Contacts nav item</em>'), 'Current nav item is selected')
			assert(~f.indexOf('<a href="/with-layout.html">Page title</a>'), 'No .eco extension in nav');
			done();
		});
	});
});