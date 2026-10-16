import * as tabs from './tabs';

import { createSpace } from './mockDatabase';
import type { tabChangeEventDetail } from '../types/store-types';

function getEBD<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Required create-space element "${id}" was not found.`);
    return element as T;
}

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
            await createSpace({ name, imageBase64: selectedIcon });
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