'use strict';

var assert = require('assert');
var path = require('path');
var navigation = require('../lib/navigation');

describe('Navigation', function() {
	// virtual file shim
	var file = function(path, title, order) {
		return {
			relative: path,
			meta: {
				navTitle: title || null,
				navOrder: order || 0
			}
		};
	};

	var nav = navigation([
		file('/index.html'),
		file('/about/index.html', 'About', 2),
		file('/feedback/index.html', 'Feedback', 1),
		file('/about/contacts/index.html', 'Contacts'),
		file('/about/contacts/email.html', 'E-mail')
	]);

	it('create', function() {
		assert.equal(nav.children.length, 2);
		assert.equal(nav.get(0).title, 'Feedback');
		assert.equal(nav.get(1).url, '/about/');
		assert.equal(nav.get(1).get('/about/contacts/').children[0].url, '/about/contacts/email.html');
		assert.equal(nav.get(1).get('/about/contacts/').children[0].title, 'E-mail');
	});

	it('for url', function() {
		var subnav = nav.forUrl('about/contacts/index.html');
		var current = subnav.find('/about/contacts/');
		assert.equal(current.selected, 'current');
		assert.equal(current.parent.selected, 'parent');
	});
});