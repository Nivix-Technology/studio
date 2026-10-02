import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

import { BrowserView, BrowserWindow, Screen } from "electrobun/bun";
import Database from 'bun:sqlite';
import mysql from 'mysql2/promise';

import * as updater from "./updater.js";
import * as utils from "./updater-utils";
import { type UpdaterRPCType } from '../shared/bun/updater-rpc-types';
import { type StoreRPCType } from '../shared/bun/store-rpc-types.js';

const studioPath = path.join(os.homedir(), 'nvxstdo');
const storePath = path.join(studioPath, 'store');
const preferencesPath = path.join(storePath, 'preferences.json');

const oldFormats = {
	"0.1.0-hub": path.join('appdata', 'store', 'inventory.ndjson'),
	"0.1.0": path.join('store', 'inventory.ndjson')
};

const ctx = { studioPath, oldFormats };

let functions: Record<string, (...args: any[]) => any> = {};
let db: Database | mysql.Pool | null = null;
let initialization: Promise<void> | null = null;
let databaseQueue: Promise<void> = Promise.resolve();
let preferencesWrite: Promise<void> = Promise.resolve();

let activeDB: string;

function enqueueDatabaseTask<T>(task: () => Promise<T> | T): Promise<T> {
	const result = databaseQueue.then(task, task);
	databaseQueue = result.then(() => undefined, () => undefined);
	return result;
}

function withDatabase<T>(operation: (api: Record<string, (...args: any[]) => any>) => Promise<T> | T): Promise<T> {
	return enqueueDatabaseTask(() => {
		if (!db || Object.keys(functions).length === 0) {
			throw new Error('The database is not ready.');
		}
		return operation(functions);
	});
}

async function closeDatabase(): Promise<void> {
	if (!db) return;
	if ('end' in db) {
		await db.end();
	} else {
		db.close();
	}
	db = null;
	functions = {};
}

async function configureDatabase(database: string, databasePath?: string): Promise<void> {
	if (database === 'sql') {
		if (!databasePath) throw new Error('A remote database URL is required.');
		
		const remoteDb = mysql.createPool({
			uri: databasePath,
			connectTimeout: 3000,
			enableKeepAlive: true,
			keepAliveInitialDelay: 5000,
			waitForConnections: true,
			connectionLimit: 10,
		});
		
		try {
			await remoteDb.query({
				sql: 'SELECT 1',
				timeout: 3000,
			});
			
			const [{ default: createApi }, initModule] = await Promise.all([
				import('./remote-sql-driver'),
				import('./init-remote-sql-database')
			]);
			await initModule.initDatabase(remoteDb);
			await closeDatabase();
			
			db = remoteDb;
			functions = createApi(remoteDb, ctx);
			activeDB = 'sql';
		} catch (error) {
			await remoteDb.end();
			throw error;
		}
		return;
	}
	
	if (database === 'sqlite') {
		const localDb = new Database(databasePath ?? path.join(storePath, 'store.sqlite'));
		const [{ default: createApi }, initModule] = await Promise.all([
			import('./local-sqlite-driver'),
			import('./init-local-sqlite-database')
		]);
		initModule.initDatabase(localDb);
		await closeDatabase();
		
		db = localDb;
		functions = createApi(localDb, ctx);
		activeDB = 'sqlite';
		return;
	}
	
	throw new Error('Database not recognized.');
}

const updaterRPC = BrowserView.defineRPC<UpdaterRPCType>({
	maxRequestTime: 20000,
	handlers: {
		requests: {
			async ready() {
				await init();
				return true;
			},
			async checkUpdate() {
				return await updater.updateAvailable();
			},
			storeHandoff() {
				// Do not destroy the WebView while it is still sending this RPC response.
				setTimeout(() => {
					const windowToClose = updaterWindow;
					openStore();
					windowToClose?.close();
					if (updaterWindow === windowToClose) updaterWindow = null;
				}, 0);
			},
			close() {
				setTimeout(() => {
					updaterWindow?.close();
					updaterWindow = null;
				}, 0);
			}
		},
		messages: {}
	}
});

const storeRPC = BrowserView.defineRPC<StoreRPCType>({
	maxRequestTime: 20000,
	handlers: {
		requests: {
			async getPreferences() {
				try {
					const preferencesContents = await fs.readFile(preferencesPath, 'utf-8');
					return JSON.parse(preferencesContents);
				} catch {
					return {};
				}
			},
			async setPreferences(preferences: object) {
				const data = JSON.stringify(preferences || {}, null, 2);
				const write = preferencesWrite.then(() => fs.writeFile(preferencesPath, data));
				preferencesWrite = write.catch(() => undefined);
				await write;
				return true;
			},
			async createSpace(name: string) {
				return withDatabase(api => api['createSpace'](name));
			},
			async renameSpace({ id, name }: { id: number; name: string }) {
				return withDatabase(api => api['renameSpace'](id, name));
			},
			async listSpaces() {
				return withDatabase(api => api['listSpaces']());
			},
			async deleteSpace(id: number) {
				return withDatabase(api => api['deleteSpace'](id));
			},
			async createCategory({
				name,
				space,
				id = null,
				fields = []
			}: {
				name: string;
				space: number;
				id?: any;
				fields?: any[]
			}) {
				return withDatabase(api => api['createCategory'](name, space, id, fields));
			},
			async renameCategory({ id, name }: { id: number; name: string }) {
				return withDatabase(api => api['renameCategory'](id, name));
			},
			async listCategories(space: number) {
				return withDatabase(api => api['listCategories'](space));
			},
			async deleteCategory(id: number) {
				return withDatabase(api => api['deleteCategory'](id));
			},
			async createItem({
				name,
				quantity = 0,
				category,
				attributes = {}
			}: {
				name: string;
				quantity?: number;
				category: number;
				attributes?: object;
			}) {
				return withDatabase(api => api['createItem'](name, quantity, category, attributes));
			},
			async deleteItem(id: number) {
				return withDatabase(api => api['deleteItem'](id));
			},
			async listAllItemsInCategoryRecursive(id: number) {
				return withDatabase(api => api['listAllItemsInCategoryRecursive'](id));
			},
			async updateItem({ id, updates = {} }: { id: number; updates?: object }) {
				return withDatabase(api => api['updateItem'](id, updates));
			},
			async listItemsByCategory(id: number) {
				return withDatabase(api => api['listItemsByCategory'](id));
			},
			async getItemById(id: number) {
				return withDatabase(api => api['getItemById'](id));
			},
			async queryItems({
				category = null,
				rules = [],
				logicalOp = 'AND'
			}: {
				category?: number | null;
				rules?: any[];
				logicalOp?: string;
			} | void = {}) {
				return withDatabase(api => api['queryItemsUnified']({
					categoryId: category,
					rules,
					logicalOp
				}));
			},
			async rebuildSearchIndex() {
				return withDatabase(api => api['rebuildSearchIndex']());
			},
			async convert({
				version,
				space
			}: {
				version: string;
				space: number;
			}) {
				return withDatabase(api => api['convert'](version, space));
			},
			async readFile({ path: relativePath }: { path: string }) {
				const absolutePath = path.resolve(import.meta.dir, '../views/store/', relativePath);
				const file = Bun.file(absolutePath);
				return await file.text();
			},
			async setDatabase({ database, databasePath }: { database: string, databasePath?: string }) {
				await enqueueDatabaseTask(() => configureDatabase(database, databasePath));
			},
			getDatabase() {
				return activeDB;
			},
			async pingServer(): Promise<boolean> {
				if (activeDB === 'sql' && db) {
					try {
						await (db as mysql.Pool).query({
							sql: 'SELECT 1',
							timeout: 2000,
						});
						return true;
					} catch (error) {
						console.error('Database heartbeat ping failed:', error);
						return false;
					}
				}
				
				if (activeDB === 'sqlite' && db) {
					return true;
				}
				
				return false;
			}
		},
		messages: {
			closeStore() {
				if (storeWindow) storeWindow.close();
			}
		}
	}
});

type UpdaterRPC = ReturnType<typeof BrowserView.defineRPC<UpdaterRPCType>>;
type StoreRPC = ReturnType<typeof BrowserView.defineRPC<StoreRPCType>>;

let storeWindow: BrowserWindow<StoreRPC> | null = null;
let updaterWindow: BrowserWindow<UpdaterRPC> | null = null;

function getWindowSize() {
	const screen = Screen.getPrimaryDisplay();
	const width = screen.workArea.width;
	const height = screen.workArea.height;
	
	const margin = 50;
	let returnWidth = 1200;
	let returnHeight = 675;
	if (width !< (returnWidth + margin)) returnWidth = (width - margin);
	if (height !< (returnHeight + margin)) returnHeight = (height - margin);
	return { width: returnWidth, height: returnHeight }
}

function openStore() {
	if (storeWindow) return;
	const { width, height } = getWindowSize();
	const { x, y } = utils.getCenterXY(width, height);
	let appliedInitialSize = false;
	
	storeWindow = new BrowserWindow({
		title: "Nivix Store",
		url: "views://store/store.html",
		frame: { width, height, x, y },
		rpc: storeRPC
	});
	
	const windowInstance = storeWindow;
	
	windowInstance.webview.on("dom-ready", () => {
		if (appliedInitialSize) return;
		appliedInitialSize = true;
		windowInstance.setSize(width, height - 1);
		setTimeout(() => windowInstance.setSize(width, height), 50);
	});
}

function openUpdater() {
	if (updaterWindow) return;
	const width = 700;
	const height = 400;
	const { x, y } = utils.getCenterXY(width, height);
	
	const windowInstance = new BrowserWindow({
		title: "Nivix Store",
		url: "views://updater/updater.html",
		transparent: true,
		titleBarStyle: "hidden",
		frame: {
			width,
			height,
			x,
			y
		},
		rpc: updaterRPC
	});
	
	updaterWindow = windowInstance;
	
	windowInstance.webview.on('dom-ready', () => {
		void init().catch(error => console.error('Failed to initialize application:', error));
	});
}

function init(): Promise<void> {
	if (!initialization) {
		initialization = (async () => {
			updaterWindow?.webview.rpc?.send.displayDebug({ message: 'Initializing App Sandbox...' });
			await fs.mkdir(studioPath, { recursive: true });
			await fs.mkdir(storePath, { recursive: true });
			await updater.init();
			await enqueueDatabaseTask(() => configureDatabase('sqlite'));
		})().catch(error => {
			initialization = null;
			const message = error instanceof Error ? error.message : String(error);
			updaterWindow?.webview.rpc?.send.displayDebug({ message, type: 'error' });
			throw error;
		});
	}
	return initialization;
}

openUpdater();

export default {
	storePath,
	studioPath
};