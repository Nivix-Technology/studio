import type { Database } from 'bun:sqlite';
import * as fsSync from 'node:fs';
import * as readline from 'node:readline';

export type SupportedVersion = '0.1.0' | '0.2.0' | '1.0.0';
export type ChunkCap = 'auto' | 'max' | number;

export interface Space {
  id: number | bigint;
  name: string;
  imageBase64?: string | null;
  created_at?: string;
}

export interface Category {
  id: number | bigint;
  space_id: number | bigint;
  parent_category_id?: number | bigint | null;
  name: string;
  created_at?: string;
}

export interface CategoryAttributeInput {
  name: string;
  dataType: 'string' | 'number' | 'boolean' | 'date';
  isRequired?: boolean;
}

export interface ItemInput {
  name: string;
  categoryId: number | bigint;
  quantity?: number;
  reorderPoint?: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface Item {
  id: number | bigint;
  category_id: number | bigint;
  name: string;
  quantity: number;
  reorder_point: number;
  created_at?: string;
  attributes?: Record<string, any>;
}

export interface ConvertOptions {
  sourceVersion?: SupportedVersion | 'auto';
  targetSpaceId: number | bigint;
  chunkCap?: ChunkCap;
}

export interface InspectionResult {
  detectedVersion: SupportedVersion | 'unknown';
  isValidSchema: boolean;
}

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS spaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image_base64 TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        space_id INTEGER NOT NULL,
        parent_category_id INTEGER NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        reorder_point REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS category_attributes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        data_type TEXT NOT NULL CHECK (data_type IN ('string', 'number', 'boolean', 'date')),
        is_required BOOLEAN DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(category_id, name)
    );

    CREATE TABLE IF NOT EXISTS item_attribute_values (
        item_id INTEGER NOT NULL,
        attribute_id INTEGER NOT NULL,
        value_string TEXT,
        value_number REAL,
        value_date DATETIME,
        value_boolean BOOLEAN,
        PRIMARY KEY (item_id, attribute_id),
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (attribute_id) REFERENCES category_attributes(id) ON DELETE CASCADE
    );
  `);
}

function getTableColumns(db: Database, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
      .map(column => column.name)
  );
}

function migrateLegacySchema(db: Database): void {
  const spaces = db.prepare('SELECT * FROM spaces').all() as Record<string, any>[];
  const categories = db.prepare('SELECT * FROM categories').all() as Record<string, any>[];
  const items = db.prepare('SELECT * FROM items').all() as Record<string, any>[];
  const spaceColumns = getTableColumns(db, 'spaces');
  const categoryColumns = getTableColumns(db, 'categories');
  const itemColumns = getTableColumns(db, 'items');
  const categoryAttributes = new Map<number | bigint, Set<string>>();
  const itemAttributes = new Map<number | bigint, Record<string, unknown>>();

  for (const category of categories) {
    const names = new Set<string>();
    if (categoryColumns.has('fields_template')) {
      const template = category['fields_template'];
      if (typeof template === 'string') {
        const parsed: unknown = JSON.parse(template || '[]');
        if (!Array.isArray(parsed) || parsed.some(name => typeof name !== 'string')) {
          throw new Error(`Category ${category['id']} has an invalid fields template.`);
        }
        parsed.forEach(name => names.add(name));
      }
    }
    categoryAttributes.set(category['id'], names);
  }

  for (const item of items) {
    const attributesValue = itemColumns.has('attributes') ? item['attributes'] : null;
    const attributes: Record<string, unknown> = typeof attributesValue === 'string'
      ? JSON.parse(attributesValue || '{}')
      : {};
    if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) {
      throw new Error(`Item ${item['id']} has invalid stored attributes.`);
    }
    itemAttributes.set(item['id'], attributes);
    const names = categoryAttributes.get(item['category_id']);
    if (names) {
      Object.keys(attributes).forEach(name => names.add(name));
    }
  }

  const attributeTypes = new Map<number | bigint, Map<string, CategoryAttributeInput['dataType']>>();
  for (const [categoryId, names] of categoryAttributes) {
    const types = new Map<string, CategoryAttributeInput['dataType']>();
    for (const name of names) {
      const values = items
        .filter(item => item['category_id'] === categoryId)
        .map(item => itemAttributes.get(item['id'])?.[name])
        .filter(value => value !== null && value !== undefined);
      const type = values.length > 0 && values.every(value => typeof value === 'number')
        ? 'number'
        : values.length > 0 && values.every(value => typeof value === 'boolean')
          ? 'boolean'
          : 'string';
      types.set(name, type);
    }
    attributeTypes.set(categoryId, types);
  }

  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN IMMEDIATE');
  try {
    db.run(`
      DROP TABLE IF EXISTS item_attributes_index;
      DROP TABLE IF EXISTS item_attribute_values;
      DROP TABLE IF EXISTS category_attributes;
      DROP TABLE items;
      DROP TABLE categories;
      DROP TABLE spaces;
    `);
    createSchema(db);

    const insertSpace = db.prepare(`
      INSERT INTO spaces (id, name, image_base64) VALUES (?, ?, ?)
    `);
    for (const space of spaces) {
      insertSpace.run(
        space['id'],
        space['name'],
        spaceColumns.has('image_base64') ? space['image_base64'] ?? null : null
      );
    }

    const insertCategory = db.prepare(`
      INSERT INTO categories (id, space_id, parent_category_id, name)
      VALUES (?, ?, NULL, ?)
    `);
    const setParentCategory = db.prepare(
      'UPDATE categories SET parent_category_id = ? WHERE id = ?'
    );
    for (const category of categories) {
      insertCategory.run(category['id'], category['parent_space'], category['name']);
      if (categoryColumns.has('parent_category') && category['parent_category'] !== null) {
        setParentCategory.run(category['parent_category'], category['id']);
      }
    }

    const insertAttribute = db.prepare(`
      INSERT INTO category_attributes (category_id, name, data_type, is_required)
      VALUES (?, ?, ?, 0)
    `);
    const insertItemAttribute = db.prepare(`
      INSERT INTO item_attribute_values
        (item_id, attribute_id, value_string, value_number, value_date, value_boolean)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);
    const attributeIds = new Map<number | bigint, Map<string, number | bigint>>();
    for (const [categoryId, types] of attributeTypes) {
      const ids = new Map<string, number | bigint>();
      for (const [name, dataType] of types) {
        ids.set(name, insertAttribute.run(categoryId, name, dataType).lastInsertRowid);
      }
      attributeIds.set(categoryId, ids);
    }

    const insertItem = db.prepare(`
      INSERT INTO items (id, category_id, name, quantity, reorder_point)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      const restockPoint = itemColumns.has('restock_point')
        ? item['restock_point'] ?? 0
        : item['reorder_point'] ?? 0;
      insertItem.run(
        item['id'],
        item['category_id'],
        item['name'],
        item['quantity'] ?? 0,
        restockPoint
      );
      const ids = attributeIds.get(item['category_id']);
      for (const [name, value] of Object.entries(itemAttributes.get(item['id']) ?? {})) {
        const attributeId = ids?.get(name);
        if (attributeId === undefined || value === null || value === undefined) continue;
        const dataType = attributeTypes.get(item['category_id'])?.get(name);
        insertItemAttribute.run(
          item['id'],
          attributeId,
          dataType === 'string' ? String(value) : null,
          dataType === 'number' ? Number(value) : null,
          dataType === 'boolean' ? (value ? 1 : 0) : null
        );
      }
    }

    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  } finally {
    db.run('PRAGMA foreign_keys = ON');
  }
}

export function initDatabase(db: Database): void {
  db.run('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const categoryColumns = getTableColumns(db, 'categories');
  if (categoryColumns.has('parent_space')) {
    migrateLegacySchema(db);
  }

  createSchema(db);
  const itemColumns = getTableColumns(db, 'items');
  if (!itemColumns.has('reorder_point')) {
    db.run('ALTER TABLE items ADD COLUMN reorder_point REAL NOT NULL DEFAULT 0');
    if (itemColumns.has('restock_point')) {
      db.run('UPDATE items SET reorder_point = restock_point');
    }
  }
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_low_stock ON items(quantity, reorder_point) WHERE reorder_point > 0;
    CREATE INDEX IF NOT EXISTS idx_attr_val_num ON item_attribute_values(attribute_id, value_number);
    CREATE INDEX IF NOT EXISTS idx_attr_val_str ON item_attribute_values(attribute_id, value_string);
  `);
}

export function createSqliteDatabaseApi(db: Database) {
  const runTransaction = <T>(callback: () => T): T => {
    db.run('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.run('COMMIT');
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  };

  // --- Spaces ---
  const createSpace = (name: string, imageBase64: string | null = null): number | bigint => {
    const stmt = db.prepare('INSERT INTO spaces (name, image_base64) VALUES (?, ?)');
    const info = stmt.run(name, imageBase64);
    return info.lastInsertRowid;
  };

  const updateSpace = (id: number | bigint, updates: { name?: string; imageBase64?: string | null }): boolean => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.imageBase64 !== undefined) {
      fields.push('image_base64 = ?');
      values.push(updates.imageBase64);
    }

    if (fields.length === 0) return false;
    values.push(id);

    const stmt = db.prepare(`UPDATE spaces SET ${fields.join(', ')} WHERE id = ?`);
    const info = stmt.run(...values);
    return info.changes > 0;
  };

  const listSpaces = (): Space[] => {
    return db
      .prepare('SELECT id, name, image_base64 AS imageBase64, created_at FROM spaces')
      .all() as Space[];
  };

  const deleteSpace = (id: number | bigint): boolean => {
    const info = db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
    return info.changes > 0;
  };

  const resetDatabase = (): void => {
    runTransaction(() => {
      db.prepare('DELETE FROM spaces').run();
    });
  };

  // --- Categories ---
  const createCategory = (
    spaceId: number | bigint,
    name: string,
    parentCategoryId: number | bigint | null = null,
    attributes: CategoryAttributeInput[] = []
  ): number | bigint => {
    return runTransaction(() => {
      const catStmt = db.prepare(
        'INSERT INTO categories (space_id, name, parent_category_id) VALUES (?, ?, ?)'
      );
      const info = catStmt.run(spaceId, name, parentCategoryId);
      const categoryId = info.lastInsertRowid;

      const attrStmt = db.prepare(
        'INSERT INTO category_attributes (category_id, name, data_type, is_required) VALUES (?, ?, ?, ?)'
      );

      for (const attr of attributes) {
        attrStmt.run(categoryId, attr.name, attr.dataType, attr.isRequired ? 1 : 0);
      }

      return categoryId;
    });
  };

  const updateCategory = (
    id: number | bigint,
    updates: { name?: string; spaceId?: number | bigint; parentCategoryId?: number | bigint | null }
  ): boolean => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.spaceId !== undefined) {
      fields.push('space_id = ?');
      values.push(updates.spaceId);
    }
    if (updates.parentCategoryId !== undefined) {
      fields.push('parent_category_id = ?');
      values.push(updates.parentCategoryId);
    }

    if (fields.length === 0) return false;
    values.push(id);

    const stmt = db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`);
    const info = stmt.run(...values);
    return info.changes > 0;
  };

  const listCategories = (spaceId: number | bigint): Category[] => {
    return db
      .prepare('SELECT id, space_id, parent_category_id, name FROM categories WHERE space_id = ?')
      .all(spaceId) as Category[];
  };

  const deleteCategory = (id: number | bigint): boolean => {
    const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return info.changes > 0;
  };

  // --- Items ---
  const createItem = (input: ItemInput): number | bigint => {
    return runTransaction(() => {
      const stmt = db.prepare(
        'INSERT INTO items (name, category_id, quantity, reorder_point) VALUES (?, ?, ?, ?)'
      );
      const info = stmt.run(input.name, input.categoryId, input.quantity ?? 0, input.reorderPoint ?? 0);
      const itemId = info.lastInsertRowid;

      if (input.attributes) {
        saveItemAttributes(itemId, input.categoryId, input.attributes);
      }

      return itemId;
    });
  };

  const createItemBulk = (items: ItemInput[]): void => {
    runTransaction(() => {
      const itemStmt = db.prepare(
        'INSERT INTO items (name, category_id, quantity, reorder_point) VALUES (?, ?, ?, ?)'
      );

      for (const item of items) {
        const info = itemStmt.run(item.name, item.categoryId, item.quantity ?? 0, item.reorderPoint ?? 0);
        if (item.attributes) {
          saveItemAttributes(info.lastInsertRowid, item.categoryId, item.attributes);
        }
      }
    });
  };

  const getItemById = (id: number | bigint): Item | null => {
    return (db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item) || null;
  };

  const deleteItem = (id: number | bigint): boolean => {
    const info = db.prepare('DELETE FROM items WHERE id = ?').run(id);
    return info.changes > 0;
  };

  function saveItemAttributes(
    itemId: number | bigint,
    categoryId: number | bigint,
    attributes: Record<string, any>
  ): void {
    const catAttrs = db
      .prepare('SELECT id, name, data_type FROM category_attributes WHERE category_id = ?')
      .all(categoryId) as { id: number; name: string; data_type: string }[];

    const attrMap = new Map(catAttrs.map((a) => [a.name, a]));

    const valStmt = db.prepare(`
      INSERT INTO item_attribute_values (item_id, attribute_id, value_string, value_number, value_boolean, value_date)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id, attribute_id) DO UPDATE SET
        value_string=excluded.value_string,
        value_number=excluded.value_number,
        value_boolean=excluded.value_boolean,
        value_date=excluded.value_date
    `);

    for (const [key, val] of Object.entries(attributes)) {
      if (val === null || val === undefined) continue;
      const attrDef = attrMap.get(key);
      if (!attrDef) continue;

      let vStr = null,
        vNum = null,
        vBool = null,
        vDate = null;
      if (attrDef.data_type === 'number') vNum = Number(val);
      else if (attrDef.data_type === 'boolean') vBool = val ? 1 : 0;
      else if (attrDef.data_type === 'date') vDate = String(val);
      else vStr = String(val);

      valStmt.run(itemId, attrDef.id, vStr, vNum, vBool, vDate);
    }
  }

  // --- Conversion ---
  const detectFileVersion = async (source: string | Buffer): Promise<InspectionResult> => {
    try {
      let contentString = '';
      if (typeof source === 'string' && fsSync.existsSync(source)) {
        contentString = fsSync.readFileSync(source, 'utf-8').slice(0, 2048);
      } else if (Buffer.isBuffer(source)) {
        contentString = source.toString('utf-8', 0, 2048);
      }

      if (contentString.includes('"version": "1.0.0"') || contentString.includes('"version":"1.0.0"')) {
        return { detectedVersion: '1.0.0', isValidSchema: true };
      }
      if (contentString.includes('"version": "0.2.0"') || contentString.includes('"version":"0.2.0"')) {
        return { detectedVersion: '0.2.0', isValidSchema: true };
      }
      if (contentString.includes('keywords') || contentString.includes('location')) {
        return { detectedVersion: '0.1.0', isValidSchema: true };
      }

      return { detectedVersion: 'unknown', isValidSchema: false };
    } catch {
      return { detectedVersion: 'unknown', isValidSchema: false };
    }
  };

  const convert = async (
    source: string | Buffer,
    options: ConvertOptions
  ): Promise<{ importedItems: number; importedCategories: number }> => {
    let sourceVersion = options.sourceVersion;

    if (!sourceVersion || sourceVersion === 'auto') {
      const inspect = await detectFileVersion(source);
      if (inspect.detectedVersion === 'unknown') {
        throw new Error('Unable to auto-detect file version schema.');
      }
      sourceVersion = inspect.detectedVersion;
    }

    const spaces = listSpaces();
    if (!spaces.some((s) => s.id === options.targetSpaceId)) {
      throw new Error(`Target space ID ${options.targetSpaceId} does not exist.`);
    }

    if (sourceVersion === '0.1.0') {
      return await convertLegacy_0_1_0(source, options.targetSpaceId, options.chunkCap || 5000);
    }

    return { importedItems: 0, importedCategories: 0 };
  };

  async function convertLegacy_0_1_0(
    source: string | Buffer,
    spaceId: number | bigint,
    chunkCap: ChunkCap
  ): Promise<{ importedItems: number; importedCategories: number }> {
    const categoryId = createCategory(spaceId, 'Imported 0.1.0 Inventory', null, [
      { name: 'location', dataType: 'string' },
      { name: 'keywords', dataType: 'string' },
    ]);

    let threshold = typeof chunkCap === 'number' ? chunkCap : 5000;
    if (chunkCap === 'auto') threshold = 20000;
    if (chunkCap === 'max') threshold = 100000;

    let itemsChunk: ItemInput[] = [];
    let totalImported = 0;

    if (typeof source === 'string' && fsSync.existsSync(source)) {
      const fileStream = fsSync.createReadStream(source);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const raw = JSON.parse(line);
          itemsChunk.push({
            name: raw.name,
            categoryId,
            quantity: raw.quantity || 0,
            attributes: {
              location: raw.location,
              keywords: raw.keywords,
            },
          });

          if (itemsChunk.length >= threshold) {
            createItemBulk(itemsChunk);
            totalImported += itemsChunk.length;
            itemsChunk = [];
          }
        } catch (e) {
          throw new Error(`Failed to parse legacy JSON line: ${e}`);
        }
      }

      if (itemsChunk.length > 0) {
        createItemBulk(itemsChunk);
        totalImported += itemsChunk.length;
      }
    }

    return { importedItems: totalImported, importedCategories: 1 };
  }

  return {
    createSpace,
    updateSpace,
    listSpaces,
    deleteSpace,
    resetDatabase,
    createCategory,
    updateCategory,
    listCategories,
    deleteCategory,
    createItem,
    createItemBulk,
    getItemById,
    deleteItem,
    detectFileVersion,
    convert,
  };
}