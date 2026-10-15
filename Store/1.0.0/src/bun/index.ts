import path from 'node:path';
import os from 'node:os';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';

// @ts-expect-error @electrbun/bun doesn't supply data types.
import { BrowserView, BrowserWindow, Screen, Utils } from "electrobun/bun";
import Database from 'bun:sqlite';

import * as updater from "./updater";
import * as utils from "./updater-utils";
import { type UpdaterRPCType } from '../rpc/updater-rpc-types';
import { type StoreRPCType } from '../rpc/store-rpc-types';
import type { DatabaseType } from '../rpc/store-types';

const legacyStudioPath = path.join(os.homedir(), 'nvxstdo');
const legacyStorePath = path.join(legacyStudioPath, 'store');
const studioPath = Utils.paths.userData;
const storePath = path.join(studioPath, 'store');
const preferencesPath = path.join(storePath, 'preferences.json');
const legacyMigrationMarker = path.join(storePath, '.legacy-storage-migrated');

type StoreFileOperation = 'read' | 'write' | 'list' | 'createDirectory' | 'delete' | 'clearDirectory';
type StoreFilePermission = 'read' | 'write' | 'list' | 'create' | 'delete' | 'clear';
type StoreFileAccess = {
	path: string;
	type: 'file' | 'directory';
} & Partial<Record<StoreFilePermission, boolean>>;

const storeFileAccess: StoreFileAccess[] = [
	{ path: 'profiles.json', type: 'file', read: true, write: true, delete: false },
	{ path: 'connectDatabase.json', type: 'file', read: true, write: true, delete: false },
	{
		path: 'UserData',
		type: 'directory',
		read: true,
		write: true,
		list: true,
		create: true,
		delete: false,
		clear: false
	},
	{
		path: 'ThemeProfiles',
		type: 'directory',
		read: true,
		write: true,
		list: true,
		create: true,
		delete: true,
		clear: false
	}
] as const;

type SqliteDatabaseApi = ReturnType<typeof import('./database-driver').createSqliteDatabaseApi>;

let functions: SqliteDatabaseApi | null = null;
let db: Database | null = null;
let initialization: Promise<void> | null = null;
let databaseQueue: Promise<void> = Promise.resolve();
let preferencesWrite: Promise<void> = Promise.resolve();
let storeFileWrite: Promise<void> = Promise.resolve();
let resettingAppData = false;

let activeDB: DatabaseType | null = null;
let activeDatabasePath: string | undefined;

function validateStoreFilePath(relativePath: string): string[] {
	if (typeof relativePath !== 'string' || relativePath.length === 0) {
		throw new Error('A relative storage path is required.');
	}

	const segments = relativePath.split(/[\\/]/);
	if (segments.some(segment =>
		!segment ||
		segment === '.' ||
		segment === '..' ||
		segment.includes(':') ||
		/[. ]$/.test(segment) ||
		/[\0-\x1f]/.test(segment)
	)) {
		throw new Error('The storage path is invalid.');
	}

	return segments;
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function getStoreFilePermission(segments: string[], operation: StoreFileOperation) {
	const normalizedPath = segments.join('/').toLocaleLowerCase('en-US');
	const permissionNames: Record<StoreFileOperation, StoreFilePermission> = {
		read: 'read',
		write: 'write',
		list: 'list',
		createDirectory: 'create',
		delete: 'delete',
		clearDirectory: 'clear'
	};
	const permissionName = permissionNames[operation];
	for (const access of storeFileAccess) {
		const allowedPath = access.path.toLocaleLowerCase('en-US');
		if (
			access.type === 'file' &&
			normalizedPath === allowedPath &&
			(permissionName === 'read' || permissionName === 'write' || permissionName === 'delete') &&
			access[permissionName]
		) {
			return access;
		}
		if (
			access.type === 'directory' &&
			(normalizedPath === allowedPath || normalizedPath.startsWith(`${allowedPath}/`)) &&
			(normalizedPath !== allowedPath || permissionName !== 'read') &&
			access[permissionName]
		) {
			return access;
		}
	}
	throw new Error('The requested storage operation is not allowed for this path.');
}

async function resolveStoreFilePath(segments: string[], createParents = false): Promise<string> {
	const studioInfo = await fs.lstat(studioPath);
	if (!studioInfo.isDirectory() || studioInfo.isSymbolicLink()) {
		throw new Error('The application storage directory is not a safe directory.');
	}
	const rootInfo = await fs.lstat(storePath);
	if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
		throw new Error('The storage directory is not a safe directory.');
	}

	let currentPath = storePath;
	for (let index = 0; index < segments.length; index++) {
		currentPath = path.join(currentPath, segments[index]);
		try {
			const info = await fs.lstat(currentPath);
			if (info.isSymbolicLink()) throw new Error('Symbolic links are not allowed in storage paths.');
			if (index < segments.length - 1 && !info.isDirectory()) {
				throw new Error('A storage path component is not a directory.');
			}
		} catch (error) {
			if (!hasErrorCode(error, 'ENOENT')) throw error;
			if (createParents && index < segments.length - 1) {
				await fs.mkdir(currentPath);
			}
		}
	}
	return currentPath;
}

async function copyLegacyDirectory(sourcePath: string, targetPath: string): Promise<void> {
	const sourceInfo = await fs.lstat(sourcePath);
	if (sourceInfo.isSymbolicLink()) {
		throw new Error('Symbolic links are not allowed in the legacy storage directory.');
	}
	if (sourceInfo.isDirectory()) {
		try {
			const targetInfo = await fs.lstat(targetPath);
			if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
				throw new Error('The new storage path contains an unsafe legacy migration target.');
			}
		} catch (error) {
			if (!hasErrorCode(error, 'ENOENT')) throw error;
			await fs.mkdir(targetPath);
		}
		for (const entry of await fs.readdir(sourcePath)) {
			await copyLegacyDirectory(path.join(sourcePath, entry), path.join(targetPath, entry));
		}
		return;
	}
	if (!sourceInfo.isFile()) {
		throw new Error('Unsupported file type in the legacy storage directory.');
	}

	try {
		const targetInfo = await fs.lstat(targetPath);
		if (targetInfo.isSymbolicLink() || !targetInfo.isFile()) {
			throw new Error('The new storage path contains an unsafe legacy migration target.');
		}
		return;
	} catch (error) {
		if (!hasErrorCode(error, 'ENOENT')) throw error;
	}
	await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
}

async function migrateLegacyStore(): Promise<void> {
	try {
		await fs.access(legacyMigrationMarker);
		return;
	} catch (error) {
		if (!hasErrorCode(error, 'ENOENT')) throw error;
	}

	try {
		const legacyInfo = await fs.lstat(legacyStorePath);
		if (legacyInfo.isSymbolicLink() || !legacyInfo.isDirectory()) {
			throw new Error('The legacy storage path is not a safe directory.');
		}
	} catch (error) {
		if (hasErrorCode(error, 'ENOENT')) return;
		throw error;
	}

	await copyLegacyDirectory(legacyStorePath, storePath);
	await fs.writeFile(legacyMigrationMarker, 'complete', 'utf-8');
}

async function manageStoreFile({
	operation,
	path: relativePath,
	content
}: {
	operation: StoreFileOperation;
	path: string;
	content?: string;
}): Promise<string | string[] | boolean | null> {
	if (resettingAppData) {
		throw new Error('Application data is currently being reset.');
	}
	if (!['read', 'write', 'list', 'createDirectory', 'delete', 'clearDirectory'].includes(operation)) {
		throw new Error('The storage operation is not recognized.');
	}
	const segments = validateStoreFilePath(relativePath);
	getStoreFilePermission(segments, operation);

	const fileContent = content;
	const mutate = async () => {
		if (operation === 'write') {
			if (typeof fileContent !== 'string') {
				throw new Error('File content must be provided as a string.');
			}
			const targetPath = await resolveStoreFilePath(segments, true);
			try {
				const info = await fs.lstat(targetPath);
				if (!info.isFile()) throw new Error('Only regular files can be written.');
				if (info.nlink > 1) throw new Error('Files linked outside the storage directory cannot be written.');
			} catch (error) {
				if (!hasErrorCode(error, 'ENOENT')) throw error;
			}
			await fs.writeFile(targetPath, fileContent, 'utf-8');
			return true;
		}

		if (operation === 'createDirectory') {
			const targetPath = await resolveStoreFilePath(segments, true);
			await fs.mkdir(targetPath, { recursive: true });
			return true;
		}

		if (operation === 'delete') {
			const targetPath = await resolveStoreFilePath(segments);
			const info = await fs.lstat(targetPath);
			if (!info.isFile()) throw new Error('Only regular files can be deleted.');
			await fs.unlink(targetPath);
			return true;
		}

		if (operation === 'clearDirectory') {
			const targetPath = await resolveStoreFilePath(segments);
			const info = await fs.lstat(targetPath);
			if (!info.isDirectory()) throw new Error('Only directories can be cleared.');
			await fs.rm(targetPath, { recursive: true });
			await fs.mkdir(targetPath);
			return true;
		}

		return false;
	};

	if (operation === 'write' || operation === 'createDirectory' || operation === 'delete' || operation === 'clearDirectory') {
		const write = storeFileWrite.then(mutate, mutate);
		storeFileWrite = write.then(() => undefined, () => undefined);
		return write;
	}

	const targetPath = await resolveStoreFilePath(segments);
	if (operation === 'read') {
		try {
			const info = await fs.lstat(targetPath);
			if (!info.isFile()) throw new Error('Only regular files can be read.');
			if (info.nlink > 1) throw new Error('Files linked outside the storage directory cannot be read.');
			return await fs.readFile(targetPath, 'utf-8');
		} catch (error) {
			if (hasErrorCode(error, 'ENOENT')) return null;
			throw error;
		}
	}

	if (operation === 'list') {
		if (segments.length === 1 && segments[0].toLocaleLowerCase('en-US') === 'userdata') {
			await fs.mkdir(targetPath, { recursive: true });
		}
		const info = await fs.lstat(targetPath);
		if (!info.isDirectory()) throw new Error('Only directories can be listed.');
		return await fs.readdir(targetPath);
	}

	throw new Error('The storage operation could not be completed.');
}

function enqueueDatabaseTask<T>(task: () => Promise<T> | T): Promise<T> {
	const result = databaseQueue.then(task, task);
	databaseQueue = result.then(() => undefined, () => undefined);
	return result;
}

function withDatabase<T>(operation: (api: SqliteDatabaseApi) => Promise<T> | T): Promise<T> {
	return enqueueDatabaseTask(() => {
		if (!db || !functions) {
			throw new Error('The database is not ready.');
		}
		return operation(functions);
	});
}

async function closeDatabase(): Promise<void> {
	if (!db) return;
	db.close();
	db = null;
	functions = null;
	activeDB = null;
	activeDatabasePath = undefined;
}

async function configureDatabase(database: DatabaseType, databasePath?: string): Promise<void> {
	if (database === 'remote') {
		throw new Error('Remote database support is intentionally disabled. Route future database calls here when the remote implementation is ready.');
	}

	if (database === 'sqlite') {
		const localDb = new Database(databasePath ?? path.join(storePath, 'store.sqlite'));
		try {
			const sqliteDriver = await import('./database-driver');
			sqliteDriver.initDatabase(localDb);
			const localFunctions = sqliteDriver.createSqliteDatabaseApi(localDb);
			await closeDatabase();

			db = localDb;
			functions = localFunctions;
			activeDB = 'sqlite';
			activeDatabasePath = databasePath;
		} catch (error) {
			localDb.close();
			throw error;
		}
		return;
	}
	
	throw new Error('Database not recognized.');
}

async function performAppDataReset(): Promise<void> {
	if (resettingAppData) throw new Error('Application data is already being reset.');
	resettingAppData = true;
	try {
		await enqueueDatabaseTask(async () => {
			const resolvedStudioPath = path.resolve(studioPath);
			const resolvedStorePath = path.resolve(storePath);
			const pathsMatch = (left: string, right: string) => process.platform === 'win32'
				? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
				: left === right;
			const unsafePaths = [
				path.parse(resolvedStudioPath).root,
				path.resolve(os.homedir()),
				path.resolve(legacyStudioPath)
			];
			if (
				unsafePaths.some(unsafePath => pathsMatch(resolvedStudioPath, unsafePath)) ||
				!pathsMatch(path.dirname(resolvedStorePath), resolvedStudioPath)
			) {
				throw new Error('The application data directory is not safe to reset.');
			}

			const info = await fs.lstat(studioPath);
			if (!info.isDirectory() || info.isSymbolicLink()) {
				throw new Error('The application data directory is not a safe directory.');
			}
			const storeInfo = await fs.lstat(storePath);
			if (!storeInfo.isDirectory() || storeInfo.isSymbolicLink()) {
				throw new Error('The application store directory is not a safe directory.');
			}

			const previousDatabase = activeDB ?? 'sqlite';
			const previousDatabasePath = activeDatabasePath;
			let databaseWasClosed = false;
			try {
				await closeDatabase();
				databaseWasClosed = true;
				await preferencesWrite;
				await storeFileWrite;
				await fs.rm(storePath, { recursive: true });
				await fs.mkdir(storePath, { recursive: true });
				await fs.writeFile(legacyMigrationMarker, 'complete', 'utf-8');
				await updater.init();
				await configureDatabase('sqlite');
			} catch (error) {
				if (databaseWasClosed) {
					try {
						await configureDatabase(previousDatabase, previousDatabasePath);
					} catch (recoveryError) {
						throw new AggregateError(
							[error, recoveryError],
							'Application data reset failed and the previous database connection could not be restored.'
						);
					}
				}
				throw error;
			}
		});
	} finally {
		resettingAppData = false;
	}
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
				} catch (error) {
					if (hasErrorCode(error, 'ENOENT')) return {};
					throw error;
				}
			},
			async setPreferences(preferences: object) {
				if (resettingAppData) throw new Error('Application data is currently being reset.');
				const data = JSON.stringify(preferences || {}, null, 2);
				const write = preferencesWrite.then(() => fs.writeFile(preferencesPath, data));
				preferencesWrite = write.catch(() => undefined);
				await write;
				return true;
			},
			async resetInventory() {
				return withDatabase(api => api.resetDatabase());
			},
			async resetAppData() {
				await performAppDataReset();
			},
			async manageStoreFile(request: {
				operation: StoreFileOperation;
				path: string;
				content?: string;
			}) {
				return manageStoreFile(request);
			},
			async createSpace({ name, imageBase64 = null }: { name: string; imageBase64?: string | null }) {
				return withDatabase(api => api.createSpace(name, imageBase64));
			},
			async updateSpace({ id, updates }: {
				id: number | bigint;
				updates: { name?: string; imageBase64?: string | null };
			}) {
				return withDatabase(api => api.updateSpace(id, updates));
			},
			async listSpaces() {
				return withDatabase(api => api.listSpaces());
			},
			async deleteSpace(id: number | bigint) {
				return withDatabase(api => api.deleteSpace(id));
			},
			async createCategory({
				name,
				spaceId,
				parentCategoryId = null,
				attributes = []
			}: {
				name: string;
				spaceId: number | bigint;
				parentCategoryId?: number | bigint | null;
				attributes?: import('./database-driver').CategoryAttributeInput[];
			}) {
				return withDatabase(api => api.createCategory(spaceId, name, parentCategoryId, attributes));
			},
			async updateCategory({ id, updates }: {
				id: number | bigint;
				updates: { name?: string; spaceId?: number | bigint; parentCategoryId?: number | bigint | null };
			}) {
				return withDatabase(api => api.updateCategory(id, updates));
			},
			async listCategories(spaceId: number | bigint) {
				return withDatabase(api => api.listCategories(spaceId));
			},
			async deleteCategory(id: number | bigint) {
				return withDatabase(api => api.deleteCategory(id));
			},
			async createItem(input: import('./database-driver').ItemInput) {
				return withDatabase(api => api.createItem(input));
			},
			async deleteItem(id: number | bigint) {
				return withDatabase(api => api.deleteItem(id));
			},
			async getItemById(id: number | bigint) {
				return withDatabase(api => api.getItemById(id));
			},
			async detectFileVersion(source: string) {
				return withDatabase(api => api.detectFileVersion(source));
			},
			async convert({ source, options }: {
				source: string;
				options: import('./database-driver').ConvertOptions;
			}) {
				return withDatabase(api => api.convert(source, options));
			},
			async readFile({ path: relativePath }: { path: string }) {
				const absolutePath = path.resolve(import.meta.dir, '../views/store/', relativePath);
				const file = Bun.file(absolutePath);
				return await file.text();
			},
			async setDatabase({ database, databasePath }: { database: DatabaseType, databasePath?: string }) {
				await enqueueDatabaseTask(() => configureDatabase(database, databasePath));
			},
			getDatabase() {
				return activeDB;
			},
			async pingServer(): Promise<boolean> {
				return activeDB === 'sqlite' && !!db;
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
		allowedProtocols: { appData: true },
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
			await migrateLegacyStore();
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