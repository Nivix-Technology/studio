import { SplashScreen } from '@capacitor/splash-screen';

import * as settings from './settings';
import * as tabs from './tabs';
import * as spaceFillers from './spaceFillers';
import * as notifications from './notifications';
import { initTooltips } from './tooltips';
import { populateSVGs } from "./fileLoader";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

let delayTimeout: ReturnType<typeof setTimeout>;

let isFinishing = false;
let initialization: Promise<void> | null = null;

export function init(): Promise<void> {
    if (!initialization) {
        initialization = initialize().catch(error => {
            initialization = null;
            throw error;
        });
    }
    return initialization;
}

async function initialize() {
    initTooltips();
    
    let loadMenuDelay: number = 750;
    
    // Load User Preferences
    try {
        await settings.init();
        loadMenuDelay = settings.preferences['loadMenuDelay'] ?? 750;
    } catch (err) {
        const message = err as string;
        notifications.showNotification(`Non-Critical Error: Failed to load user preferences: ${message}`, 'warning');
    }
    
    try {
        await populateSVGs();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifications.showNotification(`Non-Critical Error: Failed to replace icon placeholders: ${message}`, 'warning');
    }
    
    // Initialize space filler shapes
    try {
        spaceFillers.init();
    } catch (err) {
        const message = err as string;
        notifications?.showNotification(`Non-Critical Error: Failed to load space filler shapes: ${message}`, 'warning');
    }
    
    delayTimeout = setTimeout(finishLoading, loadMenuDelay);

    // Safely query the skip button only after DOM is fully ready
    const skipDelayBtn = getEBD('load-skipDelay') as HTMLButtonElement | null;
    if (skipDelayBtn) {
        skipDelayBtn.classList.remove('hidden');
        skipDelayBtn.addEventListener('click', () => {
            clearTimeout(delayTimeout);
            finishLoading();
        });
    }
}

async function finishLoading() {
    if (isFinishing) return;
    isFinishing = true;

    await SplashScreen.hide().catch(() => {});
    
    tabs.goto('selectSpace', { logPrevious: false, removePrevious: true });
}

export function checkLoadState() {
    if (document.readyState === 'complete') {
        void init();
    } else {
        window.addEventListener('load', () => void init(), { once: true });
    }
}