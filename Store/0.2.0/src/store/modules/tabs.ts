import { preferences } from './settings';
import { type TabOptions } from '../../shared/bun/store-types';

interface NavigationHistoryItem {
    id: string;
    display?: string;
}

let navigationHistory: NavigationHistoryItem[] = [];
let navigationQueue: Promise<void> = Promise.resolve();

document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('button[data-tab-navigation]');
    if (!button) return;

    const targetId = (button.dataset['tabNavigation'] ?? '')
        .split(',')
        .map((id) => id.trim())
        .find((id) => id === 'previous' || getEBD(id) !== null);
    if (!targetId) return;

    event.preventDefault();
    void goto(targetId, {
        display: button.dataset['tabDisplay'],
        logPrevious: button.dataset['tabLogPrevious'] !== 'false',
    });
});

function getEBD(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function getPrefix(id: string): string | null {
    const separatorIndex = id.lastIndexOf('_');
    return separatorIndex === -1 ? null : id.substring(0, separatorIndex);
}

function waitForAnimation(element: HTMLElement, instant: boolean, fallbackMs: number = 350): Promise<void> {
    if (instant) return Promise.resolve();

    return new Promise((resolve) => {
        let timer: number;

        const onEnd = (e: AnimationEvent) => {
            if (e.target === element) {
                cleanup();
                resolve();
            }
        };

        const cleanup = () => {
            element.removeEventListener('animationend', onEnd);
            clearTimeout(timer);
        };

        element.addEventListener('animationend', onEnd);

        // Safety fallback timer so JS promises never hang
        timer = window.setTimeout(() => {
            cleanup();
            resolve();
        }, fallbackMs);
    });
}

export async function remove(id: string, options: TabOptions = {}): Promise<void> {
    const instant = options.instant !== undefined ? options.instant : preferences['disableAnimations'];
    const thisElement = getEBD(id);

    if (!thisElement) return;

    thisElement.style.animationDuration = instant ? '0s' : '';
    thisElement.classList.remove('is-fading-in', 'is-fading-out');
    void thisElement.offsetWidth;
    thisElement.classList.add('is-fading-out');

    await waitForAnimation(thisElement, instant);
    thisElement.remove();
}

export function goto(id: string, options: TabOptions = {}): Promise<void> {
    const navigation = navigationQueue.then(() => gotoNow(id, options));
    navigationQueue = navigation.catch(() => undefined);
    return navigation;
}

async function gotoNow(id: string, options: TabOptions = {}): Promise<void> {
    const instant = options.instant !== undefined ? options.instant : preferences['disableAnimations'];
    let logPrevious = options.logPrevious !== undefined ? options.logPrevious : true;
    let display = options.display;

    if (id === 'previous') {
        const lastTab = navigationHistory.pop();
        if (!lastTab) {
            console.warn('No previous tab found in history navigation stack.');
            return;
        }

        id = lastTab.id;
        if (display === undefined) display = lastTab.display;
        logPrevious = false;
    }

    const targetPrefix = getPrefix(id);
    let tabsHidden = 0;
    let lastHiddenTab: NavigationHistoryItem | undefined;

    const existingTabs = document.querySelectorAll('.tab');
    const hidePromises: Promise<void>[] = [];

    existingTabs.forEach((existingTab) => {
        const existingTabElement = getEBD(existingTab.id);
        if (!existingTabElement) return;
        if (getPrefix(existingTab.id) !== targetPrefix) return;

        const activeDisplay = existingTabElement.style.display || getComputedStyle(existingTabElement).display;
        if (activeDisplay === 'none') return;

        hidePromises.push(hide(existingTab.id, { instant }));
        tabsHidden++;

        lastHiddenTab = { id: existingTab.id, display: activeDisplay };
    });

    if (logPrevious && tabsHidden > 0 && lastHiddenTab) {
        navigationHistory.push(lastHiddenTab);
    }

    // Wait for all active tabs to finish hiding before showing the new one
    await Promise.all(hidePromises);

    await show(id, { instant, display });
}

export async function hide(id: string, options: TabOptions = {}): Promise<void> {
    const thisElement = getEBD(id);
    if (!thisElement) return;

    const instant = options.instant !== undefined ? options.instant : preferences['disableAnimations'];

    thisElement.style.animationDuration = instant ? '0s' : '';
    thisElement.classList.remove('is-fading-in', 'is-fading-out');
    void thisElement.offsetWidth;
    thisElement.classList.add('is-fading-out');

    await waitForAnimation(thisElement, instant);

    thisElement.style.display = "none";
    thisElement.classList.remove('is-fading-out');
}

export async function show(id: string, options: TabOptions = {}): Promise<void> {
    const thisElement = getEBD(id);
    if (!thisElement) return;

    const instant = options.instant !== undefined ? options.instant : preferences['disableAnimations'];
    const thisDisplay = options.display ? options.display : "block";

    window.dispatchEvent(
        new CustomEvent('tabchange', {
            detail: { tabId: id },
        })
    );

    thisElement.style.display = thisDisplay;
    thisElement.style.animationDuration = instant ? '0s' : '';
    thisElement.classList.remove('is-fading-in', 'is-fading-out');
    void thisElement.offsetWidth;
    thisElement.classList.add('is-fading-in');

    await waitForAnimation(thisElement, instant);

    thisElement.classList.remove('is-fading-in');
}