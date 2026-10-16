import { preferences } from './settings';
import { type TabOptions } from '../types/store-types';

interface NavigationHistoryItem {
    id: string;
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
        logPrevious: button.dataset['tabLogPrevious'] !== 'false',
    });
});

// Highlight active navigation buttons based on tabChange events
window.addEventListener('tabChange', ((event: CustomEvent<{ tabId: string }>) => {
    const activeTabId = event.detail.tabId;
    const highlightButtons = document.querySelectorAll<HTMLButtonElement>('button[data-active-tab-highlight="true"]');

    highlightButtons.forEach((button) => {
        const navAttr = button.dataset['tabNavigation'] ?? '';
        const navIds = navAttr.split(',').map((id) => id.trim());
        
        if (navIds.includes(activeTabId)) {
            button.classList.add('primary');
        } else {
            button.classList.remove('primary');
        }
    });
}) as EventListener);

function getEBD(id: string): HTMLElement | null {
    return document.getElementById(id);
}

function getTree(id: string): Array<string> {
    const parts = id.split('_');
    const tree: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        tree.push(parts.slice(0, i + 1).join('_'));
    }
    return tree;
}

function isSubTab(id: string): boolean {
    return getTree(id).length > 1;
}

function focusFirstFocusable(element: HTMLElement): void {
    const focusableElements = element.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]'
    );
    const firstFocusable = Array.from(focusableElements).find((candidate) =>
        candidate.tabIndex >= 0 &&
        !candidate.hasAttribute('disabled') &&
        candidate.getClientRects().length > 0 &&
        getComputedStyle(candidate).visibility !== 'hidden'
    );

    firstFocusable?.focus();
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
    const instant = options.instant !== undefined ? options.instant : !preferences['transitionAnimations'];
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
    const instant = options.instant !== undefined ? options.instant : !preferences['transitionAnimations'];
    let logPrevious = options.logPrevious !== undefined ? options.logPrevious : true;

    if (id === 'previous') {
        const lastTab = navigationHistory.pop();
        if (!lastTab) {
            console.warn('No previous tab found in history navigation stack.');
            return;
        }

        id = lastTab.id;
        logPrevious = false;
    }

    const targetTree = getTree(id);
    let tabsHidden = 0;
    let lastHiddenTab: NavigationHistoryItem | undefined;

    const existingTabs = document.querySelectorAll('.tab');
    const hidePromises: Promise<void>[] = [];

    existingTabs.forEach((existingTab) => {
        const existingTabElement = getEBD(existingTab.id);
        if (!existingTabElement) return;

        const existingTree = getTree(existingTab.id);
        
        // Keep ancestors visible
        if (targetTree.includes(existingTab.id)) return;

        const existingRoot = existingTree[0];
        const targetRoot = targetTree[0];
        const existingParent = existingTree.slice(0, -1).join('_');
        const targetParent = targetTree.slice(0, -1).join('_');

        // Hide if it belongs to a completely different root tree
        const isDifferentRoot = existingRoot !== targetRoot;
        // Hide if it's a direct sibling under the same parent level
        const isSibling = existingTree.length === targetTree.length && existingParent === targetParent;

        if (!isDifferentRoot && !isSibling) return;

        const activeDisplay = existingTabElement.style.display || getComputedStyle(existingTabElement).display;
        if (activeDisplay === 'none') return;

        hidePromises.push(hide(existingTab.id, { instant }));
        tabsHidden++;

        lastHiddenTab = { id: existingTab.id };
    });

    if (logPrevious && tabsHidden > 0 && lastHiddenTab) {
        navigationHistory.push(lastHiddenTab);
    }

    window.dispatchEvent(
        new CustomEvent('tabChange', {
            detail: { tabId: id },
        })
    );

    // Wait for all active tabs to finish hiding before showing the new one
    await Promise.all(hidePromises);
    await show(id, { instant });
}

export async function hide(id: string, options: TabOptions = {}): Promise<void> {
    const thisElement = getEBD(id);
    if (!thisElement) return;

    const instant = options.instant !== undefined ? options.instant : !preferences['transitionAnimations'];

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

    const instant = options.instant !== undefined ? options.instant : !preferences['transitionAnimations'];
    const thisDisplay = thisElement.dataset['tabDisplay'] || 'block';

    // Ensure parent tree is shown first
    const parentTree = getTree(id);
    parentTree.pop();

    for (const parentId of parentTree) {
        const parentElement = getEBD(parentId);
        if (!parentElement || !parentElement.classList.contains('tab')) continue;

        const parentDisplay = parentElement.style.display || getComputedStyle(parentElement).display;
        if (parentDisplay === 'none') await show(parentId, { instant });
    }

    thisElement.style.display = thisDisplay;
    thisElement.style.animationDuration = instant ? '0s' : '';
    thisElement.classList.remove('is-fading-in', 'is-fading-out');
    void thisElement.offsetWidth;
    thisElement.classList.add('is-fading-in');

    await waitForAnimation(thisElement, instant);

    thisElement.classList.remove('is-fading-in');
    if (isSubTab(id)) focusFirstFocusable(thisElement);
}