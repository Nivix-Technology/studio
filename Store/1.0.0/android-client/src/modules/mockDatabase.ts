import { Preferences } from '@capacitor/preferences';
import type { Space } from '../types/store-types';

export interface CreateSpaceInput {
    name: string;
    imageBase64?: string | null;
}

export interface UpdateSpaceInput {
    name?: string;
    imageBase64?: string | null;
}

interface MockDatabaseState {
    version: 1;
    nextSpaceId: number;
    spaces: Space[];
}

const storageKey = 'mockupDatabase';
let operationQueue: Promise<void> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
}

function emptyDatabase(): MockDatabaseState {
    return { version: 1, nextSpaceId: 1, spaces: [] };
}

function isSpace(value: unknown): value is Space {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Number.isSafeInteger(record['id']) && (record['id'] as number) > 0 &&
        typeof record['name'] === 'string' && Boolean(record['name'].trim()) && record['name'].length <= 128 &&
        (record['imageBase64'] === undefined || record['imageBase64'] === null ||
            typeof record['imageBase64'] === 'string');
}

async function readDatabase(): Promise<MockDatabaseState> {
    const { value } = await Preferences.get({ key: storageKey });
    if (!value) return emptyDatabase();

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch (error) {
        throw new Error('The mock database contains invalid JSON.', { cause: error });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('The mock database has an invalid format.');
    }

    const state = parsed as Record<string, unknown>;
    if (state['version'] !== 1 || !Number.isSafeInteger(state['nextSpaceId']) ||
        (state['nextSpaceId'] as number) < 1 || !Array.isArray(state['spaces']) ||
        !state['spaces'].every(isSpace)) {
        throw new Error('The mock database has an unsupported or invalid schema.');
    }
    const spaces = state['spaces'] as Space[];
    const ids = spaces.map(space => Number(space.id));
    if (new Set(ids).size !== ids.length || ids.some(id => id >= (state['nextSpaceId'] as number))) {
        throw new Error('The mock database has inconsistent space identifiers.');
    }
    return state as unknown as MockDatabaseState;
}

async function writeDatabase(state: MockDatabaseState): Promise<void> {
    await Preferences.set({ key: storageKey, value: JSON.stringify(state) });
}

export function listSpaces(): Promise<Space[]> {
    return enqueue(async () => {
        const state = await readDatabase();
        return state.spaces.map(space => ({ ...space }));
    });
}

export function createSpace(input: CreateSpaceInput): Promise<number> {
    return enqueue(async () => {
        const name = input.name.trim();
        if (!name || name.length > 128) {
            throw new Error('Space names must contain between 1 and 128 characters.');
        }

        const state = await readDatabase();
        if (!Number.isSafeInteger(state.nextSpaceId) || state.nextSpaceId >= Number.MAX_SAFE_INTEGER) {
            throw new Error('The mock database has run out of space identifiers.');
        }
        const id = state.nextSpaceId;
        state.nextSpaceId += 1;
        state.spaces.push({
            id,
            name,
            ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {})
        });
        await writeDatabase(state);
        return id;
    });
}

export function updateSpace(id: number | bigint, updates: UpdateSpaceInput): Promise<boolean> {
    return enqueue(async () => {
        const numericId = Number(id);
        if (!Number.isSafeInteger(numericId) || numericId < 1) return false;

        let normalizedUpdates = updates;
        if (updates.name !== undefined) {
            const name = updates.name.trim();
            if (!name || name.length > 128) {
                throw new Error('Space names must contain between 1 and 128 characters.');
            }
            normalizedUpdates = { ...updates, name };
        }

        const state = await readDatabase();
        const space = state.spaces.find(entry => entry.id === numericId);
        if (!space) return false;

        if (normalizedUpdates.name !== undefined) space.name = normalizedUpdates.name;
        if (normalizedUpdates.imageBase64 !== undefined) space.imageBase64 = normalizedUpdates.imageBase64;
        await writeDatabase(state);
        return true;
    });
}

export function deleteSpace(id: number | bigint): Promise<boolean> {
    return enqueue(async () => {
        const numericId = Number(id);
        if (!Number.isSafeInteger(numericId) || numericId < 1) return false;

        const state = await readDatabase();
        const index = state.spaces.findIndex(space => space.id === numericId);
        if (index < 0) return false;
        state.spaces.splice(index, 1);
        await writeDatabase(state);
        return true;
    });
}

export function resetMockDatabase(): Promise<void> {
    return enqueue(async () => writeDatabase(emptyDatabase()));
}
