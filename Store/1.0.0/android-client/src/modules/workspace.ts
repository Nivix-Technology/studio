import * as tabs from './tabs';

import { type tabChangeEventDetail } from "../types/store-types";

let isInitialized = false;

export function init(): void {
    if (isInitialized) return;

    isInitialized = true;
}

export function gotoWorkspace(_space: number | bigint) {
    tabs.goto('workspace');
}

window.addEventListener('tabChange', (event) => {
    const eventDetails = event as CustomEvent<tabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'workspace') {
        init();
    }
});