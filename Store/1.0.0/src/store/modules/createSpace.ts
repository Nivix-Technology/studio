import * as tabs from './tabs';

import { electroview } from './index';
import type { tabChangeEventDetail } from '../../rpc/store-types';

function getEBD<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Required create-space element "${id}" was not found.`);
    return element as T;
}

const randomSpaceNames = [
    'Warehouse', 'Workshop', 'Studio', 'Pantry', 'Archive',
    'Tool Shed', 'Supply Room', 'Field Office', 'Stockroom', 'Laboratory'
];
const randomSpaceIconColors = [
    ['#2878b8', '#17527f'],
    ['#4f8b57', '#315e38'],
    ['#a25a3d', '#713c2a'],
    ['#8060a8', '#594078'],
    ['#c08b32', '#89601e'],
    ['#3c8d91', '#286467'],
    ['#b24e65', '#7c3345'],
    ['#596b9e', '#3b4b76']
];
const randomSpaceIcons = randomSpaceIconColors.map(([primary, secondary], index) => {
    const letter = String.fromCharCode(65 + index);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs><rect width="128" height="128" rx="24" fill="url(#g)"/><path d="M20 48 64 22l44 26v52H20z" fill="#fff" fill-opacity=".16"/><path d="M37 61h54v34H37zM46 70h12v16H46zm24 0h12v16H70z" fill="#fff"/><text x="64" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">${letter}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
});

let isInitialized: boolean = false;

const form = getEBD('createSpace-form') as HTMLFormElement;
const continueBtn = getEBD('createSpace-continue') as HTMLButtonElement;
const nameInput = getEBD('createSpace-name') as HTMLInputElement;
const cancelBtn = getEBD('createSpace-cancel') as HTMLButtonElement;
const errorOutput = getEBD('createSpace-output') as HTMLSpanElement;
const iconInput = getEBD('createSpace-icon-input') as HTMLInputElement;
const iconButton = getEBD('createSpace-icon') as HTMLButtonElement;
const resetIconButton = getEBD('createSpace-icon-reset') as HTMLButtonElement;

let selectedIcon: string | null = null;

function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') {
                reject(new Error('The selected image could not be read.'));
                return;
            }
            resolve(reader.result);
        };
        reader.onerror = () => reject(reader.error ?? new Error('The selected image could not be read.'));
        reader.readAsDataURL(file);
    });
}

export function createRandomSpace(): Promise<{ name: string; id: number | bigint }> {
    const name = randomSpaceNames[Math.floor(Math.random() * randomSpaceNames.length)];
    const imageBase64 = randomSpaceIcons[Math.floor(Math.random() * randomSpaceIcons.length)];
    if (!name || !imageBase64) throw new Error('Random space presets are unavailable.');
    return electroview.rpc!.request.createSpace({ name, imageBase64 })
        .then((id: number | bigint) => ({ name, id }));
}

export async function init() {
    if (isInitialized) return;
    
    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (continueBtn.disabled) return;
        const name = nameInput.value.trim();
        if (!name) {
            errorOutput.innerText = `Space Name Cannot Be Empty`;
            return;
        };
        try {
            continueBtn.disabled = true;
            await electroview.rpc!.request.createSpace({ name, imageBase64: selectedIcon });
            tabs.goto('previous');
            errorOutput.innerText = '';
            nameInput.value = '';
            selectedIcon = null;
            iconInput.value = '';
        } catch (err) {
            errorOutput.innerText = `Failed to Create Space: ${err}`;
        } finally {
            continueBtn.disabled = false;
        }
    });

    iconButton.addEventListener('click', () => iconInput.click());
    iconInput.addEventListener('change', async () => {
        const file = iconInput.files?.[0];
        if (!file) return;
        try {
            selectedIcon = await readImage(file);
            errorOutput.innerText = '';
        } catch (error) {
            errorOutput.innerText = `Failed to read space icon: ${error instanceof Error ? error.message : String(error)}`;
        }
    });
    resetIconButton.addEventListener('click', () => {
        selectedIcon = null;
        iconInput.value = '';
    });
    
    cancelBtn.addEventListener('click', function() {
        errorOutput.innerText = '';
        nameInput.value = '';
        selectedIcon = null;
        iconInput.value = '';
    });

    isInitialized = true;
}

window.addEventListener('tabChange', (event) => {
    const eventDetails = event as CustomEvent<tabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'createSpace') {
        init();
        nameInput.focus();
    }
});