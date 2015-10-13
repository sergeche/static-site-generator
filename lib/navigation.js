/**
 * Generates a site navigation structure for given file list
 */
'use strict';

var path = require('path');
var extend = require('xtend');
var utils = require('./utils');

var defaultOptions = {
	indexFiles: /^index\.\w+/
};

module.exports = function(fileList, options) {
	options = extend(defaultOptions, options || {});

	var nav = fileList
	.map(function(file) {
		return new NavItem(file, options);
	}).reduce(function(nav, item) {
		var insPoint = item.url
		.split('/')
		.filter(Boolean)
		.reduce(function(section, slug) {
			// find subsection with given slug name
			for (var i = 0, il = section.children.length; i < il; i++) {
				if (section.children[i].name === slug) {
					return section.children[i];
				}
			}

			// no section found, create new one
			var subsection = {
				name: slug,
				children: [],
				navItem: null
			};
			section.children.push(subsection);
			return subsection;
		}, nav);

		insPoint.navItem = item;
		return nav;
	}, {
		name: ':root',
		children: [],
		navItem: null
	});

	return new Nav(sort(optimize(nav.children)), options);
};

class Nav {
	constructor(items, options) {
		this._options = options;
		this.root = true;
		this.url = '/';
		this.selected = 'parent';
		this.children = (items || []).map(function(item) {
			item.parent = this;
			return item;
		}, this);
	}

	get(search) {
		return findItem(this.children, search);
	}

	forUrl(url) {
		var nav = new Nav(this.children.map(function(item) {
			return item.clone();
		}), this._options);

		url = utils.makeUrl(url, this._options.indexFiles);
		if (url === '/') {
			nav.selected = 'current';
		} else {
			nav.flatten().forEach(function(item) {
				if (item.url === url) {
					item.selected = 'current';
					while (item.parent && 'selected' in item.parent) {
						item.parent.selected = 'parent';
						item = item.parent;
					}
				}
			});
		}

		return nav;
	}

	find(url) {
		return findItem(this.flatten(), url);
	}

	/**
	 * Returns flattened list of all child nav items
	 * @return {Array}
	 */
	flatten() {
		return flattenItems(this.children);
	}

	/**
	 * Returns currently selected navigation item
	 * @return {NavItem}
	 */
	current() {
		if (this.selected === 'current') {
			return this;
		}

		return this.flatten().filter(function(item) {
			return item.selected === 'current';
		})[0];
	}

	toJSON() {
		return this.children.map(function(item) {
			return item.toJSON();
		});
	}

	toString() {
		return stringify(this.children).join('\n');
	}
};

class NavItem {
	constructor(file, options) {
		options = options || {};
		var meta = (file && file.meta) || {};

		this._options = options;
		this.parent = null;
		this.selected = false;
		this.file = file;
		this.url = utils.makeUrl(file.relative, options.indexFiles, options.nameResolver);
		this.children = [];
		this.sortOrder = meta.navOrder ? parseFloat(meta.navOrder) : 0;
		this.title = meta.navTitle || meta.title || null;
	}

	get(search) {
		return findItem(this.children, search);
	}

	add(item, options) {
		if (!(item instanceof NavItem)) {
			item = new NavItem(item, options);
		}
		this.children.push(item);
		item.parent = this;
		return this;
	}

	clone() {
		var clone = new NavItem(this.file, this._options);
		this.children.forEach(function(item) {
			clone.add(item.clone());
		});
		return clone;
	}

	/**
	 * Returns flattened list of all child nav items
	 * @return {Array}
	 */
	flatten() {
		return flattenItems(this.children);
	}

	toJSON() {
		var json = {
			url: this.url,
			title: this.title
		};
		if (this.selected) {
			json.selected = item.selected;
		}
		if (this.children) {
			json.children = this.children.map(function(item) {
				return item.toJSON();
			});
		}
		return json;
	}
};

/**
 * Optimizes given nav structure: removes intermediate nodes that have no 
 * nav items 
 * @param  {Array} nav
 * @return {Array}
 */
function optimize(nav) {
	nav = nav.map(function(item) {
		item.children = optimize(item.children);
		return item.navItem ? item : item.children;
	});

	return utils.flatten(nav).filter(Boolean).map(function(item) {
		// turn children array into child nav items
		item.children.forEach(function(child) {
			item.navItem.add(child);
		});
		return item.navItem;
	});
}

function flattenItems(items) {
	return utils.flatten(items.map(function(item) {
		return [item].concat(flattenItems(item.children));
	})).filter(Boolean);
}

function sort(nav) {
	return nav.map(function(item) {
		item.children = sort(item.children);
		return item;
	}).sort(function(a, b) {
		return a.sortOrder - b.sortOrder;
	});
}

function stringify(items, indent) {
	indent = indent || '';
	return utils.flatten(items.map(function(item) {
		var result = indent + (item.title || '(null)') + ' ' + item.url;
		if (item.selected) {
			result += ' (' + item.selected + ')';
		}
		return [result].concat(stringify(item.children, '  ' + indent));
	}));
}

function findItem(items, search) {
	if (typeof search === 'number') {
		return items[search];
	}

	for (var i = 0, il = items.length; i < il; i++) {
		if (items[i].url === search) {
			return items[i];
		}
	}
}