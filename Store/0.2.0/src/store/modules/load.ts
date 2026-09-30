import * as settings from './settings';
import * as tabs from './tabs';
import * as index from './index';
import * as spaceFillers from './spaceFillers';
import * as notifications from './notifications';
import { initTooltips } from './tooltips';

import { electroview } from './index';
import { populateSVGs } from "./fileLoader";

// Import all modules that listen for tabchange events, so electrobun can package them, and all top-level code is ran.
import './connectDatabase';
import './createSpace';
import './selectSpace';

function getEBD(id: string) {return document.getElementById(id)}
function wait(ms: number) {return new Promise((resolve) => { setTimeout(resolve, ms)})}

const versionLabel = getEBD('load-footer-version');

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
    versionLabel!.innerText = `v${index.store.sessionVersion}` || "Failed to get session version";
    
    initTooltips();
    
    let menuDelay: number = 750;
    
    // Load User Preferences
    try {
        await settings.init();
        menuDelay = settings.preferences['menuDelay'] ?? 750;
    } catch (err) {
        const message = err as string;
        notifications.showNotification(`Non-Critical Error: Failed to load user preferences: ${message}`, 'warning');
    }
    
    // Replace SVG Placeholders with SVGs
    try {
        await populateSVGs((path) => electroview.rpc!.request.readFile({ path }));
    } catch {
        try {
            await populateSVGs();
        } catch (err) {
            const message = err as string;
            notifications?.showNotification(`Non-Critical Error: Failed to replace icon placeholders: ${message}`, 'warning');
        }
    }
    
    // Attempt to bind tab-navigation fix.
    try {
        document.addEventListener('keydown', (event: KeyboardEvent): void => {
            if (event.key !== 'Tab') return;
            
            const selector = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
            const focusables = Array.from(
                document.querySelectorAll<HTMLElement>(selector)
            ).filter((el: HTMLElement) => {
                const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
                const isNotDisabled = !el.hasAttribute('disabled');
                return isVisible && isNotDisabled;
            });
            
            if (focusables.length === 0) return;
            
            const firstEl = focusables[0];
            const lastEl = focusables[focusables.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;
            
            if (event.shiftKey && activeElement === firstEl) {
                lastEl.focus();
                event.preventDefault();
            } else if (!event.shiftKey && activeElement === lastEl) {
                firstEl.focus();
                event.preventDefault();
            }
        });
    } catch (err) {
        const message = err as string;
        notifications?.showNotification(`Non-Critical Error: Failed to load keyboard navigation fix: ${message}`, 'warning');
    }
    
    // Initialize space filler shapes
    try {
        spaceFillers.init();
    } catch (err) {
        const message = err as string;
        notifications?.showNotification(`Non-Critical Error: Failed to load space filler shapes: ${message}`, 'warning');
    }
    
    await wait(menuDelay);
    await finishLoading();
}

async function finishLoading() {
    if (isFinishing) return;
    isFinishing = true;
    
    tabs.goto('selectSpace', { display: 'flex' });
}

export function checkLoadState() {
    if (document.readyState === 'complete') {
        void init();
    } else {
        window.addEventListener('load', () => void init(), { once: true });
    }
}
