import { electroview, restart } from './index';

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

let isInitialized = false;

let currentPreferences: Record<string, any> = {
    spaceFillersEnabled: true,
    transitionAnimations: true,
    menuDelay: 750,
    spaceFillerAnimations: true,
    saveLastConnection: false
};
export let preferences: Readonly<Record<string, any>> = Object.freeze({ ...currentPreferences });
let preferenceWrite: Promise<void> = Promise.resolve();
let settingsInputsInitialized = false;

function isConnectionDetails(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || !('mode' in value)) return false;
    if (value.mode === 'url') return 'url' in value && typeof value.url === 'string';
    return value.mode === 'fields' &&
    'prefix' in value && typeof value.prefix === 'string' &&
    'hostname' in value && typeof value.hostname === 'string' &&
    'port' in value && typeof value.port === 'string' &&
    'database' in value && typeof value.database === 'string' &&
    'username' in value && typeof value.username === 'string';
}

export async function init() {
    const savedPreferences = await electroview.rpc?.request.getPreferences();
    if (savedPreferences && Object.keys(savedPreferences).length > 0) {
        const {
            databaseConnectionProfiles: legacyProfiles,
            lastDatabaseConnection: legacyLastConnection,
            ...savedCurrentPreferences
        } = savedPreferences;
        // Preserve new defaults when a user has an older preferences file.
        currentPreferences = { ...currentPreferences, ...savedCurrentPreferences };
        preferences = Object.freeze({ ...currentPreferences });
        let preferencesChanged = legacyLastConnection !== undefined;
        if (legacyLastConnection !== undefined) {
            if (legacyLastConnection !== null && !isConnectionDetails(legacyLastConnection)) {
                throw new Error('The saved last database connection has an invalid format.');
            }
            const existingConnection = await electroview.rpc?.request.manageStoreFile({
                operation: 'read',
                path: 'connectDatabase.json'
            });
            if (existingConnection === null) {
                const migrated = await electroview.rpc?.request.manageStoreFile({
                    operation: 'write',
                    path: 'connectDatabase.json',
                    content: JSON.stringify(legacyLastConnection, null, 2)
                });
                if (migrated !== true) throw new Error('Failed to migrate the last database connection.');
            } else if (typeof existingConnection !== 'string') {
                throw new Error('The last database connection could not be read.');
            }
        }
        if (legacyProfiles !== undefined) {
            if (!Array.isArray(legacyProfiles)) {
                throw new Error('Saved connection profiles have an invalid format.');
            }
            const existingProfiles = await electroview.rpc?.request.manageStoreFile({
                operation: 'read',
                path: 'profiles.json'
            });
            if (existingProfiles === null) {
                const migrated = await electroview.rpc?.request.manageStoreFile({
                    operation: 'write',
                    path: 'profiles.json',
                    content: JSON.stringify(legacyProfiles, null, 2)
                });
                if (migrated !== true) throw new Error('Failed to migrate saved connection profiles.');
            } else if (typeof existingProfiles !== 'string') {
                throw new Error('Saved connection profiles could not be read.');
            } else if (!Array.isArray(JSON.parse(existingProfiles))) {
                throw new Error('Saved connection profiles have an invalid format.');
            }
            preferencesChanged = true;
        }
        if (preferencesChanged) {
            const preferencesSaved = await electroview.rpc?.request.setPreferences(currentPreferences);
            if (preferencesSaved !== true) throw new Error('Failed to migrate saved connection settings.');
        }
    }

    initSettingsInputs();
    applySettings();
    initTab();
}

function initSettingsInputs() {
    if (settingsInputsInitialized) return;

    document.querySelectorAll<HTMLInputElement>('input').forEach(input => {
        if (!input.hasAttribute('data-settings-key')) return;

        const key = input.getAttribute('data-settings-key')!;
        if (!(key in currentPreferences)) {
            console.error(`Unknown settings key on input: ${key}`);
            return;
        }

        if (input.type === 'checkbox') {
            if (typeof currentPreferences[key] !== 'boolean') {
                console.error(`Setting ${key} must be a boolean for a checkbox input.`);
                return;
            }
            input.checked = currentPreferences[key];
        } else {
            input.value = String(currentPreferences[key]);
        }

        input.addEventListener('change', () => {
            const value = input.type === 'checkbox' ? Boolean(input.checked) : input.value;
            void setPreference(key, value).catch(error => {
                console.error(`Failed to save preference ${key}:`, error);
            });
        });
    });

    settingsInputsInitialized = true;
}

async function setPreference(key: string, value: any) {
    if (!(key in currentPreferences)) {
        const errorMsg = `Unknown key: ${key}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    if (typeof(value) !== typeof(currentPreferences[key])) {
        const errorMsg = `The new value for ${key} is not the same type as the existing value: ${typeof(currentPreferences[key])}. Type of attempted value is ${typeof(value)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    currentPreferences[key] = value;
    preferences = Object.freeze({ ...currentPreferences });
    applySettings();
    notifyPreferencesUpdate(key);
    const snapshot = { ...currentPreferences };
    const write = preferenceWrite.then(async () => {
        const preferencesSaved = await electroview.rpc?.request.setPreferences(snapshot);
        if (preferencesSaved !== true) throw new Error(`Failed to save preference ${key}.`);
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
}

function notifyPreferencesUpdate(preference: string) {
    window.dispatchEvent(new CustomEvent('preferencesUpdate', {
        detail: { preference }
    }));
}

function applySettings() {
    const rootStyle = document.documentElement.style;
    if (preferences['transitionAnimations']) rootStyle.removeProperty('--transition-speed');
    else rootStyle.setProperty('--transition-speed', '0s');
}

// Tab Functionality

const restartBtn = getEBD<HTMLButtonElement>('settings-restart');

function initTab() {
    if (isInitialized) return;

    restartBtn.addEventListener('click', restart);

    isInitialized = true;
}