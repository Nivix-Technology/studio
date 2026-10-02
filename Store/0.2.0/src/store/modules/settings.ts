import { electroview, restart } from './index';
import type { TabChangeEventDetail } from "../../shared/bun/store-types.ts";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

let isInitialized = false;

export let preferences: Record<string, any> = {
    disableAnimations: false,
    menuDelay: 750,
    disableShapeAnimations: false,
    databaseConnectionProfiles: [],
    lastDatabaseConnection: null,
    saveLastConnection: false
};
let preferenceWrite: Promise<void> = Promise.resolve();

export async function init() {
    const savedPreferences = await electroview.rpc?.request.getPreferences();
    if (savedPreferences && Object.keys(savedPreferences).length > 0) {
        // Preserve new defaults when a user has an older preferences file.
        preferences = { ...preferences, ...savedPreferences };
        return;
    }
}

export async function setPreference(key: string, value: any) {
    if (!(key in preferences)) {
        const errorMsg = `Unknown key: ${key}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    if (typeof(value) !== typeof(preferences[key])) {
        const errorMsg = `The new value for ${key} is not the same type as the existing value: ${typeof(preferences[key])}. Type of attempted value is ${typeof(value)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    preferences[key] = value;
    const snapshot = { ...preferences };
    const write = preferenceWrite.then(async () => {
        await electroview.rpc?.request.setPreferences(snapshot);
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
    applySettings();
}

function applySettings() {
    if (preferences['disableAnimations']) {
        const allElements = document.querySelectorAll<HTMLElement>('*');
        allElements.forEach(function(element) {
            element.style.transition = 'none';
        });
    }
}

// Tab Functionality

const restartBtn = getEBD<HTMLButtonElement>('settings-restart');

function initTab() {
    if (isInitialized) return;

    restartBtn.addEventListener('click', restart);

    isInitialized = true;
}

window.addEventListener('tabchange', (event) => {
    const eventDetails = event as CustomEvent<TabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'settings') {
        initTab();
    }
});