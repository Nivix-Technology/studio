import { electroview, restart } from './index';
import { init as initNxLib } from './nxlib';
import { showNotification, showPopup } from './notifications';

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

let isInitialized = false;

const defaultPreferences: Record<string, any> = {
    spaceFillersEnabled: true,
    transitionAnimations: true,
    menuDelay: 750,
    spaceFillerAnimations: true,
    saveLastConnection: false
};
let currentPreferences: Record<string, any> = { ...defaultPreferences };
export let preferences: Readonly<Record<string, any>> = Object.freeze({ ...currentPreferences });
let preferenceWrite: Promise<void> = Promise.resolve();
let settingsInputsInitialized = false;

export async function init() {
    const savedPreferences = await electroview.rpc?.request.getPreferences();
    if (Object.keys(savedPreferences).length > 0) {
        currentPreferences = { ...currentPreferences, ...savedPreferences };
        preferences = Object.freeze({ ...currentPreferences });
    }
    
    initSettingsInputs();
    applySettings();
    initNxLib();
    initTab();
}

function initSettingsInputs() {
    if (settingsInputsInitialized) return;
    
    document.querySelectorAll<HTMLInputElement>('input').forEach(input => {
        if (!input.hasAttribute('data-preferences-key')) return;
        
        const key = input.getAttribute('data-preferences-key')!;
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
        } else if (input.type === 'number') {
            input.valueAsNumber = Number(currentPreferences[key]);
        } else {
            input.value = currentPreferences[key];
        }
        
        input.addEventListener('change', () => {
            let value: any;
            
            if (input.type === 'checkbox') {
                value = Boolean(input.checked);
            } else if (input.type === 'number') {
                value = input.valueAsNumber;
                if (Number.isNaN(value)) {
                    value = currentPreferences[key];
                }
            } else {
                value = input.value;
            }
            
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

async function resetPreferences() {
    const snapshot = { ...defaultPreferences };
    const write = preferenceWrite.then(async () => {
        const preferencesSaved = await electroview.rpc?.request.setPreferences(snapshot);
        if (preferencesSaved !== true) throw new Error('Failed to reset preferences.');
        currentPreferences = snapshot;
        preferences = Object.freeze({ ...currentPreferences });
        applySettings();
        for (const key of Object.keys(defaultPreferences)) {
            notifyPreferencesUpdate(key);
        }
        document.querySelectorAll<HTMLInputElement>('input[data-preferences-key]').forEach(input => {
            const key = input.getAttribute('data-preferences-key')!;
            const value = currentPreferences[key];
            if (input.type === 'checkbox') input.checked = value;
            else if (input.type === 'number') input.valueAsNumber = Number(value);
            else input.value = String(value);
        });
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
    initNxLib();
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
const resetAppDataBtn = getEBD<HTMLButtonElement>('settings-reset-appData');
const resetInventoryBtn = getEBD<HTMLButtonElement>('settings-reset-resetInventory');
const resetPreferencesBtn = getEBD<HTMLButtonElement>('settings-reset-preferences');

async function confirmReset(title: string, message: string): Promise<boolean> {
    return await showPopup<boolean>(title, message, 'options', [
        { content: 'Cancel', value: false, highlighted: true },
        { content: 'Reset', value: true }
    ]) === true;
}

async function resetInventory() {
    if (!await confirmReset(
        'Reset Inventory',
        'This permanently deletes all spaces, categories, and items from the currently connected database. This cannot be undone.'
    )) return;

    try {
        if (!electroview.rpc?.request.resetInventory) {
            throw new Error('The inventory reset service is unavailable.');
        }
        await electroview.rpc.request.resetInventory();
        showNotification('The connected database inventory has been reset.');
    } catch (error) {
        console.error('Failed to reset the connected database inventory:', error);
        showNotification('Failed to reset the connected database inventory.', 'error');
    }
}

async function resetAllAppData() {
    if (!await confirmReset(
        'Reset App Data',
        'This permanently deletes all data stored by this app on this device, including preferences, saved connections, local inventory, and user files. Remote database contents are not deleted. The app will return to its default local database.'
    )) return;

    try {
        if (!electroview.rpc?.request.resetAppData) {
            throw new Error('The app-data reset service is unavailable.');
        }
        await electroview.rpc.request.resetAppData();
        window.location.reload();
    } catch (error) {
        console.error('Failed to reset application data:', error);
        showNotification('Failed to reset application data.', 'error');
    }
}

function initTab() {
    if (isInitialized) return;
    
    restartBtn.addEventListener('click', restart);
    resetAppDataBtn.addEventListener('click', () => void resetAllAppData());
    resetInventoryBtn.addEventListener('click', () => void resetInventory());
    resetPreferencesBtn.addEventListener('click', () => {
        void (async () => {
            try {
                if (!await confirmReset(
                    'Reset Preferences',
                    'This restores all preferences to their default values.'
                )) return;
                await resetPreferences();
                showNotification('Preferences have been reset.');
            } catch (error) {
                console.error('Failed to reset preferences:', error);
                showNotification('Failed to reset preferences.', 'error');
            }
        })();
    });
    
    isInitialized = true;
}