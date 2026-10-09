import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';

const requiredTables = ['spaces', 'categories', 'items', 'item_attributes_index'];

const tableQueries = [
	`CREATE TABLE IF NOT EXISTS spaces (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(255) NOT NULL
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	`CREATE TABLE IF NOT EXISTS categories (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		parent_space INT NOT NULL,
		parent_category INT NULL,
		fields_template JSON,
		CONSTRAINT fk_categories_space
			FOREIGN KEY (parent_space) REFERENCES spaces(id) ON DELETE CASCADE,
		CONSTRAINT fk_categories_parent
			FOREIGN KEY (parent_category) REFERENCES categories(id) ON DELETE CASCADE
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	`CREATE TABLE IF NOT EXISTS items (
		id INT AUTO_INCREMENT PRIMARY KEY,
		category_id INT NOT NULL,
		name VARCHAR(255) NOT NULL,
		quantity INT DEFAULT 0,
		quantity_commited INT DEFAULT 0,
		restock_point INT DEFAULT 0,
		attributes JSON,
		CONSTRAINT fk_items_category
			FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
	`CREATE TABLE IF NOT EXISTS item_attributes_index (
		item_id INT NOT NULL,
		attr_key VARCHAR(255) NOT NULL,
		attr_value VARCHAR(255),
		PRIMARY KEY (item_id, attr_key),
		CONSTRAINT fk_attr_index_item
			FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

const indexQueries = [
	'CREATE INDEX idx_attributes_search ON item_attributes_index (attr_key, attr_value)',
	'CREATE INDEX idx_items_name ON items (name)',
	'CREATE INDEX idx_items_quantity ON items (quantity)'
];

function isDuplicateIndexError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = 'code' in error ? error.code : undefined;
	const errno = 'errno' in error ? error.errno : undefined;
	return code === 'ER_DUP_KEYNAME' || errno === 1061;
}

function isDdlPermissionError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = 'code' in error ? error.code : undefined;
	const errno = 'errno' in error ? error.errno : undefined;
	return code === 'ER_TABLEACCESS_DENIED_ERROR' ||
		code === 'ER_DBACCESS_DENIED_ERROR' ||
		errno === 1142 ||
		errno === 1044;
}

async function requiredTablesExist(db: mysql.Pool): Promise<boolean> {
	const [rows] = await db.query<RowDataPacket[]>(
		`SELECT COUNT(DISTINCT table_name) AS existing_count
		 FROM information_schema.tables
		 WHERE table_schema = DATABASE() AND table_name IN (?)`,
		[requiredTables]
	);
	return Number(rows[0]?.['existing_count'] ?? 0) === requiredTables.length;
}

export async function initDatabase(db: mysql.Pool): Promise<void> {
	try {
		for (const query of tableQueries) {
			await db.query(query);
		}

		for (const query of indexQueries) {
			try {
				await db.query(query);
			} catch (error) {
				if (!isDuplicateIndexError(error)) throw error;
			}
		}
	} catch (error) {
		if (!isDdlPermissionError(error)) throw error;
		if (await requiredTablesExist(db)) return;
		throw new Error(
			'The remote database is missing required tables and this account cannot create them.',
			{ cause: error }
		);
	}
}
