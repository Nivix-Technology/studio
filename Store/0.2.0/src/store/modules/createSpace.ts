import { loadCSS } from './file-loader';
import * as tabs from './tabs';
import * as selectSpace from './selectSpace';

import { electroview } from './index';
import type { TabChangeEventDetail } from '../../shared/bun/store-types';

function getEBD(id: string) {return document.getElementById(id)}
function wait(ms: number) {return new Promise((resolve) => { setTimeout(resolve, ms)})}

let isInitialized: boolean = false;

const form = getEBD('createSpace-form') as HTMLFormElement;
const continueBtn = getEBD('createSpace-continue') as HTMLButtonElement;
const nameInput = getEBD('createSpace-name') as HTMLInputElement;
const cancelBtn = getEBD('createSpace-cancel') as HTMLButtonElement;
const errorOutput = getEBD('createSpace-output') as HTMLSpanElement;

export async function init() {
    if (isInitialized) return;
    loadCSS('sheets/createSpace.css');
    
    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        if (continueBtn.disabled) return;
        if (!nameInput.value || !nameInput.value.trim() || nameInput.value.trim() === '') {
            errorOutput.innerText = `Space Name Cannot Be Empty`;
            return;
        };
        console.log(`Creating New Space: ${nameInput.value}`);
        try {
            continueBtn.disabled = true;
            await electroview.rpc?.request.createSpace(nameInput.value);
            if (nameInput.value.toLowerCase().trim() === 'empty' && errorOutput.innerText === 'Space Name Cannot Be Empty') {
                errorOutput.innerText = 'Haha. Very Funny';
                await wait(500);
            }
            await selectSpace.populateSpacesPrompt();
            tabs.goto('previous');
            await wait(tabs.programaticAnimationDuration);
            errorOutput.innerText = '';
            nameInput.value = '';
        } catch (err) {
            errorOutput.innerText = `Failed to Create Space: ${err}`;
        } finally {
            continueBtn.disabled = false;
        }
    });
    
    cancelBtn.addEventListener('click', function() {
        errorOutput.innerText = '';
        nameInput.value = '';
    });
    
    isInitialized = true;
}

window.addEventListener('tabchange', (event) => {
    const eventDetails = event as CustomEvent<TabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'createSpace') {
        init();
        nameInput.focus();
    };
});