import type { Database, SQLQueryBindings } from 'bun:sqlite';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type {
	Category,
	ChunkCap,
	Item,
	ItemInput,
	QueryUnifiedOptions,
	Space
} from '../rpc/store-types';

export interface AppContext {
	studioPath: string;
	oldFormats: Record<string, string>;
}

function createCurrentSchema(db: Database): void {
	db.run(`
		CREATE TABLE IF NOT EXISTS spaces (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS categories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			parent_space INTEGER NOT NULL,
			parent_category INTEGER,
			fields_template TEXT NOT NULL DEFAULT '[]',
			FOREIGN KEY (parent_space) REFERENCES spaces(id) ON DELETE CASCADE,
			FOREIGN KEY (parent_category) REFERENCES categories(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			category_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			quantity REAL NOT NULL DEFAULT 0,
			quantity_commited REAL NOT NULL DEFAULT 0,
			restock_point REAL NOT NULL DEFAULT 0,
			attributes TEXT NOT NULL DEFAULT '{}',
			FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS item_attributes_index (
			item_id INTEGER NOT NULL,
			attr_key TEXT NOT NULL,
			attr_value TEXT,
			PRIMARY KEY (item_id, attr_key),
			FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_attributes_search
			ON item_attributes_index (attr_key, attr_value COLLATE NOCASE);
		CREATE INDEX IF NOT EXISTS idx_items_name ON items (name);
		CREATE INDEX IF NOT EXISTS idx_items_quantity ON items (quantity);
	`);
}

function migrateNormalizedSchema(db: Database): void {
	const spaces = db.prepare('SELECT id, name FROM spaces').all() as Record<string, any>[];
	const categories = db.prepare('SELECT * FROM categories').all() as Record<string, any>[];
	const items = db.prepare('SELECT * FROM items').all() as Record<string, any>[];
	const attributeDefinitions = db.prepare('SELECT id, category_id, name FROM category_attributes')
		.all() as Record<string, any>[];
	const attributeValues = db.prepare('SELECT * FROM item_attribute_values').all() as Record<string, any>[];
	const attributeNames = new Map(attributeDefinitions.map(definition => [
		definition['id'],
		definition['name']
	]));
	const itemAttributes = new Map<number | bigint, Record<string, any>>();

	for (const entry of attributeValues) {
		const name = attributeNames.get(entry['attribute_id']);
		if (typeof name !== 'string') continue;
		let value: unknown;
		if (entry['value_number'] !== null) value = entry['value_number'];
		else if (entry['value_boolean'] !== null) value = Boolean(entry['value_boolean']);
		else if (entry['value_date'] !== null) value = entry['value_date'];
		else value = entry['value_string'];
		const attributes = itemAttributes.get(entry['item_id']) ?? {};
		attributes[name] = value;
		itemAttributes.set(entry['item_id'], attributes);
	}

	const fieldsByCategory = new Map<number | bigint, string[]>();
	for (const definition of attributeDefinitions) {
		const names = fieldsByCategory.get(definition['category_id']) ?? [];
		names.push(definition['name']);
		fieldsByCategory.set(definition['category_id'], names);
	}

	db.run('BEGIN IMMEDIATE');
	try {
		db.run('DROP TABLE item_attribute_values');
		db.run('DROP TABLE category_attributes');
		db.run('DROP TABLE items');
		db.run('DROP TABLE categories');
		db.run('DROP TABLE spaces');
		createCurrentSchema(db);

		const insertSpace = db.prepare('INSERT INTO spaces (id, name) VALUES (?, ?)');
		for (const space of spaces) insertSpace.run(space['id'], space['name']);

		const insertCategory = db.prepare(`
			INSERT INTO categories (id, name, parent_space, parent_category, fields_template)
			VALUES (?, ?, ?, NULL, ?)
		`);
		for (const category of categories) {
			insertCategory.run(
				category['id'],
				category['name'],
				category['space_id'],
				JSON.stringify(fieldsByCategory.get(category['id']) ?? [])
			);
		}
		const setParentCategory = db.prepare(
			'UPDATE categories SET parent_category = ? WHERE id = ?'
		);
		for (const category of categories) {
			if (category['parent_category_id'] !== null) {
				setParentCategory.run(category['parent_category_id'], category['id']);
			}
		}

		const insertItem = db.prepare(`
			INSERT INTO items (id, category_id, name, quantity, quantity_commited, restock_point, attributes)
			VALUES (?, ?, ?, ?, 0, ?, ?)
		`);
		const insertAttribute = db.prepare(`
			INSERT INTO item_attributes_index (item_id, attr_key, attr_value) VALUES (?, ?, ?)
		`);
		for (const item of items) {
			const attributes = itemAttributes.get(item['id']) ?? {};
			insertItem.run(
				item['id'],
				item['category_id'],
				item['name'],
				item['quantity'],
				item['reorder_point'] ?? 0,
				JSON.stringify(attributes)
			);
			for (const [key, value] of Object.entries(attributes)) {
				if (value !== null && value !== undefined) {
					insertAttribute.run(item['id'], key, String(value));
				}
			}
		}
		db.run('COMMIT');
	} catch (error) {
		db.run('ROLLBACK');
		throw error;
	}
}

export function initDatabase(db: Database): void {
	db.run('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
	const categoryColumns = db.prepare('PRAGMA table_info(categories)')
		.all() as Record<string, any>[];
	const columnNames = new Set(categoryColumns.map(column => column['name']));

	if (columnNames.has('space_id') && !columnNames.has('parent_space')) {
		migrateNormalizedSchema(db);
	} else {
		createCurrentSchema(db);
	}
}

function parseJsonObject(value: unknown): Record<string, any> {
	if (typeof value === 'string') {
		const parsed: unknown = JSON.parse(value || '{}');
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('Stored item attributes must be a JSON object.');
		}
		return parsed as Record<string, any>;
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		return value as Record<string, any>;
	}
	return {};
}

function parseItem(row: Record<string, any>): Item {
	return { ...row, attributes: parseJsonObject(row['attributes']) } as Item;
}

export default function createSqliteDatabaseApi(db: Database, ctx: AppContext) {
	const runTransaction = <T>(callback: () => T): T => {
		db.run('BEGIN IMMEDIATE');
		try {
			const result = callback();
			db.run('COMMIT');
			return result;
		} catch (error) {
			db.run('ROLLBACK');
			throw error;
		}
	};

	const createSpace = (name: string): number | bigint => {
		return db.prepare('INSERT INTO spaces (name) VALUES (?)').run(name).lastInsertRowid;
	};

	const renameSpace = (id: number | bigint, name: string): boolean => {
		return db.prepare('UPDATE spaces SET name = ? WHERE id = ?').run(name, id).changes > 0;
	};

	const listSpaces = (): Space[] => {
		return db.prepare('SELECT id, name FROM spaces').all() as Space[];
	};

	const deleteSpace = (id: number | bigint): boolean => {
		return db.prepare('DELETE FROM spaces WHERE id = ?').run(id).changes > 0;
	};

	const resetDatabase = (): void => {
		runTransaction(() => {
			db.prepare('DELETE FROM item_attributes_index').run();
			db.prepare('DELETE FROM items').run();
			db.prepare('DELETE FROM categories').run();
			db.prepare('DELETE FROM spaces').run();
		});
	};

	const createCategory = (
		name: string,
		space: number | bigint,
		category: number | bigint | null = null,
		fields: string[] = []
	): number | bigint => {
		return db.prepare(
			'INSERT INTO categories (name, parent_space, parent_category, fields_template) VALUES (?, ?, ?, ?)'
		).run(name, space, category, JSON.stringify(fields)).lastInsertRowid;
	};

	const renameCategory = (id: number | bigint, name: string): boolean => {
		return db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id).changes > 0;
	};

	const listCategories = (space: number | bigint): Category[] => {
		const rows = db.prepare(
			'SELECT id, name, parent_space, parent_category, fields_template FROM categories WHERE parent_space = ?'
		).all(space) as Record<string, any>[];
		return rows.map(row => ({
			...row,
			fields_template: typeof row['fields_template'] === 'string'
				? JSON.parse(row['fields_template'] || '[]')
				: row['fields_template']
		})) as Category[];
	};

	const deleteCategory = (id: number | bigint): boolean => {
		return db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes > 0;
	};

	const replaceAttributeIndex = (itemId: number | bigint, attributes: Record<string, any>): void => {
		db.prepare('DELETE FROM item_attributes_index WHERE item_id = ?').run(itemId);
		const insert = db.prepare(
			'INSERT INTO item_attributes_index (item_id, attr_key, attr_value) VALUES (?, ?, ?)'
		);
		for (const [key, value] of Object.entries(attributes)) {
			if (value !== null && value !== undefined) insert.run(itemId, key, String(value));
		}
	};

	const createItem = (
		name: string,
		quantity = 0,
		category: number | bigint,
		attributes: Record<string, any> = {}
	): number | bigint => {
		return runTransaction(() => {
			const result = db.prepare(
				'INSERT INTO items (name, quantity, category_id, attributes) VALUES (?, ?, ?, ?)'
			).run(name, quantity, category, JSON.stringify(attributes));
			replaceAttributeIndex(result.lastInsertRowid, attributes);
			return result.lastInsertRowid;
		});
	};

	const createItemBulk = (items: ItemInput[], categoryId: number | bigint): void => {
		runTransaction(() => {
			const insert = db.prepare(
				'INSERT INTO items (name, quantity, category_id, attributes) VALUES (?, ?, ?, ?)'
			);
			for (const item of items) {
				const attributes = item.attributes ?? {};
				const result = insert.run(item.name, item.quantity ?? 0, categoryId, JSON.stringify(attributes));
				replaceAttributeIndex(result.lastInsertRowid, attributes);
			}
		});
	};

	const listItemsByCategory = (categoryId: number | bigint): Item[] => {
		const rows = db.prepare(
			'SELECT id, name, quantity, quantity_commited, restock_point, category_id, attributes FROM items WHERE category_id = ?'
		).all(categoryId) as Record<string, any>[];
		return rows.map(parseItem);
	};

	const getItemById = (itemId: number | bigint): Item | null => {
		const row = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as Record<string, any> | null;
		return row ? parseItem(row) : null;
	};

	const deleteItem = (id: number | bigint): boolean => {
		return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
	};

	const listAllItemsInCategoryRecursive = (categoryId: number | bigint): Item[] => {
		const rows = db.prepare(`
			WITH RECURSIVE subcategories(id) AS (
				SELECT id FROM categories WHERE id = ?
				UNION ALL
				SELECT categories.id FROM categories
				JOIN subcategories ON categories.parent_category = subcategories.id
			)
			SELECT items.* FROM items
			WHERE items.category_id IN (SELECT id FROM subcategories)
		`).all(categoryId) as Record<string, any>[];
		return rows.map(parseItem);
	};

	const updateItem = (
		id: number | bigint,
		updates: Partial<ItemInput> & Record<string, any> = {}
	): boolean => {
		return runTransaction(() => {
			const current = getItemById(id);
			if (!current) throw new Error(`Item with ID ${id} not found.`);

			const attributes = updates['attributes']
				? { ...current.attributes, ...updates['attributes'] }
				: current.attributes;
			const result = db.prepare(`
				UPDATE items
				SET name = ?, category_id = ?, quantity = ?, quantity_commited = ?, restock_point = ?, attributes = ?
				WHERE id = ?
			`).run(
				updates['name'] ?? current.name,
				updates['category_id'] ?? current.category_id,
				updates['quantity'] ?? current.quantity,
				updates['quantity_commited'] ?? current.quantity_commited ?? 0,
				updates['restock_point'] ?? current.restock_point ?? 0,
				JSON.stringify(attributes),
				id
			);
			if (result.changes > 0 && updates['attributes']) replaceAttributeIndex(id, attributes);
			return result.changes > 0;
		});
	};

	const queryItemsUnified = ({
		categoryId = null,
		rules = [],
		logicalOp = 'AND'
	}: QueryUnifiedOptions = {}): Item[] => {
		const operatorWhitelist = new Set(['=', '>=', '<=', '>', '<', 'LIKE', '!=']);
		const nativeFields = new Set(['name', 'quantity', 'quantity_commited', 'restock_point', 'category_id']);
		const normalizedLogicalOp = logicalOp.toUpperCase();
		if (normalizedLogicalOp !== 'AND' && normalizedLogicalOp !== 'OR') {
			throw new Error(`Unsupported logical operator: ${logicalOp}`);
		}

		const whereClauses: string[] = [];
		const params: SQLQueryBindings[] = [];
		if (categoryId !== null) {
			whereClauses.push('i.category_id = ?');
			params.push(categoryId);
		}

		const ruleClauses = rules.map(rule => {
			if (!operatorWhitelist.has(rule.operator)) {
				throw new Error(`Unsupported query operator: ${rule.operator}`);
			}
			const value = rule.operator === 'LIKE' ? `%${String(rule.value)}%` : rule.value;
			if (rule.type === 'native') {
				if (!nativeFields.has(rule.field)) throw new Error(`Invalid native column lookup: ${rule.field}`);
				params.push(value);
				return `i.${rule.field} ${rule.operator} ?`;
			}
			if (rule.type !== 'attribute') throw new Error(`Unsupported query rule type: ${rule.type}`);
			params.push(rule.field, String(value));
			return `EXISTS (
				SELECT 1 FROM item_attributes_index attr
				WHERE attr.item_id = i.id AND attr.attr_key = ? AND attr.attr_value ${rule.operator} ?
			)`;
		});
		if (ruleClauses.length) whereClauses.push(`(${ruleClauses.join(` ${normalizedLogicalOp} `)})`);
		const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
		const rows = db.prepare(`SELECT i.* FROM items i ${where}`).all(...params) as Record<string, any>[];
		return rows.map(parseItem);
	};

	const rebuildSearchIndex = (): number => {
		return runTransaction(() => {
			db.prepare('DELETE FROM item_attributes_index').run();
			const items = db.prepare('SELECT id, attributes FROM items').all() as Record<string, any>[];
			for (const item of items) {
				replaceAttributeIndex(item['id'], parseJsonObject(item['attributes']));
			}
			return items.length;
		});
	};

	const convert = async (
		version: string,
		spaceId: number | bigint,
		chunkCap: ChunkCap = 5000
	): Promise<void> => {
		const relativePath = ctx.oldFormats[version];
		if (!relativePath) return;
		const spaces = listSpaces();
		if (!spaces.some(space => space.id === spaceId)) throw new Error('Space match error.');

		const oldPath = path.join(ctx.studioPath, relativePath);
		const inventory = fsSync.createReadStream(oldPath);
		const lineReader = readline.createInterface({ input: inventory, crlfDelay: Infinity });
		const categoryId = createCategory(`${version} Inventory`, spaceId, null, ['location', 'keywords']);
		const threshold = chunkCap === 'auto'
			? 50000
			: chunkCap === 'max'
				? 200000
				: chunkCap;
		if (!Number.isInteger(threshold) || threshold <= 0) {
			throw new Error('The conversion chunk size must be a positive integer.');
		}

		let chunk: ItemInput[] = [];
		for await (const line of lineReader) {
			if (!line.trim()) continue;
			let legacyItem: Record<string, any>;
			try {
				legacyItem = JSON.parse(line);
			} catch (error) {
				throw new Error(`Failed to parse legacy inventory line: ${error}`);
			}
			chunk.push({
				name: legacyItem['name'],
				quantity: legacyItem['quantity'] ?? 0,
				attributes: {
					location: legacyItem['location'],
					keywords: legacyItem['keywords']
				}
			});
			if (chunk.length >= threshold) {
				createItemBulk(chunk, categoryId);
				chunk = [];
			}
		}
		if (chunk.length) createItemBulk(chunk, categoryId);
	};

	return {
		createSpace,
		renameSpace,
		listSpaces,
		deleteSpace,
		createCategory,
		renameCategory,
		listCategories,
		deleteCategory,
		createItem,
		createItemBulk,
		resetDatabase,
		listItemsByCategory,
		getItemById,
		deleteItem,
		listAllItemsInCategoryRecursive,
		updateItem,
		queryItemsUnified,
		rebuildSearchIndex,
		convert
	};
}
