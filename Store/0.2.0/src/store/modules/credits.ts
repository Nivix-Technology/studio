import type { TabChangeEventDetail } from "../../shared/bun/store-types";
import { loadCSS } from "./file-loader";

function getEBD(id: string) {return document.getElementById(id)}

let isInitialized: boolean = false;

export function init() {
    if (isInitialized) return;

    loadCSS('sheets/credits.css');

    isInitialized = true;
}

window.addEventListener('tabchange', (event) => {
    const eventDetails = event as CustomEvent<TabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'credits') init();
});