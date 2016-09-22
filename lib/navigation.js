/**
 * Generates a site navigation structure for given file list
 */
'use strict';

const path = require('path');
const utils = require('./utils');

const defaultOptions = {
	indexFiles: /^index\.\w+/
};

module.exports = function(fileList, options) {
	options = Object.assign({}, defaultOptions, options);

	// Step 1: transform a flat file list into a tree where each url slug
	// is a tree node
	const root = node(new NavItem({relative: '/'}, options));

	fileList
	.filter(file => !file.meta || !file.meta.navHidden)
	.map(file => new NavItem(file, options))
	.forEach(navItem => {
		if (navItem.url === '/') {
			return root.navItem = navItem;
		}

		const slugs = navItem.url.split('/').filter(Boolean);
		const lastSlug = slugs.pop();

		let ctx = root.items;
		slugs.forEach(slug => {
			if (!ctx.has(slug)) {
				ctx.set(slug, node());
			}
			ctx = ctx.get(slug).items;
		});

		// put current nav item into matched subtree
		if (!ctx.has(lastSlug)) {
			ctx.set(lastSlug, node(navItem));
		} else {
			ctx.get(lastSlug).navItem = navItem;
		}
	});

	// Step 2: remove empty intermediate nodes,
	// nest nav items and return final nav structure
	return new Nav(squash(root).children, options);
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
		var nav = new Nav(this.children.map(item => item.clone()), this._options);

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
		this.url = utils.makeUrl(meta.url || file.relative, options.indexFiles);
		this.children = [];
		this.sortOrder = meta.navOrder ? parseFloat(meta.navOrder) : this.children.length / 1000;
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
		this.children.sort(navSorter);
		item.parent = this;
		return this;
	}

	clone() {
		var clone = new NavItem(this.file, this._options);
		this.children.forEach(item => clone.add(item.clone()));
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
			json.children = this.children.map(item => item.toJSON());
		}
		return json;
	}
};


function flattenItems(items) {
	return utils.flatten(items.map(function(item) {
		return [item].concat(flattenItems(item.children));
	})).filter(Boolean);
}

function node(navItem) {
	return {
		items: new Map(),
		navItem
	};
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

function navSorter(a, b) {
	return a.sortOrder - b.sortOrder;
}

/**
 * Squashes initial nav tree: discarts nodes that don’t have thier nav item
 * (e.g. actual file for given url) and moves its child nodes to first parent
 * with nav item
 * @param  {Object} nav
 * @param  {Object} [target]
 * @return {NavItem}
 */
function squash(nav, target) {
	if (!target) {
		target = nav.navItem;
	}

	nav.items.forEach(item => {
		if (item.navItem) {
			target.add(item.navItem);
		}
		squash(item, item.navItem || target);
	});
	return target;
}
