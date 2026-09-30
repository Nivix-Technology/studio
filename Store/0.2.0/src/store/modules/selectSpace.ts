import { populateSVGs } from "./fileLoader";
import { showNotification, showPopup } from "./notifications";
import { preferences, setPreference } from "./settings";
import { fillSpaceContainer } from "./spaceFillers";

import { electroview } from "./index";
import { type TabChangeEventDetail } from "../../shared/bun/store-types";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let isInitialized: boolean = false;

const fadeOutAnimation = "nivixFadeOut 0.1s ease-out forwards";
const fadeInAnimation = "nivixFadeIn 0.2s ease-out forwards";
const programaticAnimationDuration = 200;
const itemDelay = 25; // Adjust this (in ms) to make the staggered pops faster or slower

const sourceCodeBtn = getEBD<HTMLButtonElement>('selectSpace-source');
const issuesBtn = getEBD<HTMLButtonElement>('selectSpace-issues');
const quitBtn = getEBD<HTMLButtonElement>('selectSpace-quit');
const shapeAnimToggle = getEBD<HTMLInputElement>('selectSpace-shapeAnimToggle');
const refreshBtn = getEBD<HTMLButtonElement>('selectSpace-refresh');
const createBtn = getEBD<HTMLButtonElement>('selectSpace-create');

export async function init() {
    if (isInitialized) return;
    
    sourceCodeBtn.addEventListener('click', function() {
        window.open('https://github.com/SqueakyLlama1/nivix-studio-dev/tree/main/Store/0.2.0', '_blank');
    });

    issuesBtn.addEventListener('click', function() {
        window.open('https://github.com/SqueakyLlama1/nivix-studio-dev/issues', '_blank');
    });
    
    quitBtn.addEventListener('click', function() {
        electroview.rpc?.send.closeStore();
    });
    
    refreshBtn.addEventListener('click', (e: MouseEvent) => {
        populateSpacesList(true, !preferences['disableAnimations'] && !e.shiftKey);
    });
    
    shapeAnimToggle.addEventListener('change', toggleShapeAnimations);
    shapeAnimToggle.checked = preferences['disableShapeAnimations'];
    
    toggleShapeAnimations();
    
    isInitialized = true;
}

function toggleShapeAnimations() {
    void setPreference('disableShapeAnimations', shapeAnimToggle.checked).catch((error: unknown) => {
        console.error('Failed to save animation preference:', error);
    });
    fillSpaceContainer();
}

async function populateSpacesList(fadeOut?: boolean, animate: boolean = !preferences['disableAnimations']): Promise<void> {
    const spacesList = getEBD<HTMLDivElement>('selectSpace-list');

    // Smoothly fade out existing items
    if (fadeOut && animate) {
        const existingItems = spacesList.querySelectorAll<HTMLElement>('.item');
        if (existingItems.length > 0) {
            existingItems.forEach((item) => {
                item.style.animation = fadeOutAnimation;
            });

            await wait(programaticAnimationDuration);
            existingItems.forEach((item) => item.remove());
        }
    }

    // Clear any remaining elements
    spacesList.innerHTML = '';

    // Fetch spaces list via RPC
    const spaces = await electroview.rpc!.request.listSpaces();
    if (!spaces.length) {
        spacesList.innerHTML = `<div class="center"${animate ? ` style="animation: ${fadeInAnimation}"` : ''}>You have no spaces. Click 'Create New Space' at the bottom right of this menu to get started!</div>`;
        createBtn.focus();
    }

    // Sequentially build and append items so they pop up one by one
    for (const space of spaces) {
        const containerEl = document.createElement('div');
        const headerEl = document.createElement('div');
        const iconButtonEl = document.createElement('button');
        const iconEl = document.createElement('img');
        const editIndicatorEl = document.createElement('span');
        const editSvgPlaceholderEl = document.createElement('svgplaceholder');
        const nameEl = document.createElement('span');
        const continueBtn = document.createElement('button');
        const actionsContainerEl = document.createElement('div');
        const deleteBtn = document.createElement('button');
        const renameBtn = document.createElement('button');
        const dividerEl = document.createElement('hr');

        containerEl.className = 'item center';
        headerEl.className = 'space-header';

        iconButtonEl.type = 'button';
        iconButtonEl.className = 'space-icon-button tooltip-support-button tip-bottom';
        iconButtonEl.dataset['tooltipContent'] = 'Changing icons will soon be available';

        iconEl.className = 'space-icon';
        iconEl.src = new URL('assets/favicon.png', import.meta.url).href;
        iconEl.alt = '';

        editIndicatorEl.className = 'space-icon-edit';
        editSvgPlaceholderEl.textContent = 'assets/svg/edit.svg';
        editIndicatorEl.appendChild(editSvgPlaceholderEl);
        iconButtonEl.append(iconEl, editIndicatorEl);

        nameEl.className = 'name-column';
        nameEl.innerText = space.name;
        headerEl.append(iconButtonEl, nameEl);

        continueBtn.textContent = 'Open';
        continueBtn.className = 'nivix-primary-button primary continue-button';

        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'nivix-secondary-button';

        renameBtn.textContent = 'Rename';
        renameBtn.className = 'nivix-secondary-button';
        renameBtn.onclick = async () => {
            const newName = await showPopup(
                `Renaming '${space.name}'`,
                'text',
                undefined,
                { placeholder: 'New Name' }
            );

            if (newName && newName !== space.name) {
                await electroview.rpc!.request.renameSpace({ id: space.id, name: newName });
                populateSpacesList(true);
            }
        };

        let firstItemAppended = false;

        deleteBtn.onclick = async (e: MouseEvent) => {
            const verified = e.shiftKey ? true : await showPopup(
                `Are you sure you want to delete the space '${space.name} (ID: ${space.id})'? This cannot be undone.<button class="tooltip-button tip-right" data-tooltip-content="You can hold Shift while clicking the Delete button to bypass the popup.">i</button>`,
                'options',
                [
                    { content: 'No', value: false, highlighted: true },
                    { content: 'Yes', value: true, highlighted: false }
                ]
            );

            if (verified) {
                try {
                    await electroview.rpc!.request.deleteSpace(space.id);
                    showNotification(`Deleted Space '${space.name}'`);
                    populateSpacesList(true, !preferences['disableAnimations'] && !e.shiftKey);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    showNotification(`Failed to delete space '${space.name}': ${message}`, 'error');
                }
            }
        };

        actionsContainerEl.className = 'actions';
        actionsContainerEl.append(deleteBtn, renameBtn, continueBtn);

        dividerEl.className = 'tile-divider';
        containerEl.append(headerEl, dividerEl, actionsContainerEl);

        if (animate) containerEl.style.animation = fadeInAnimation;
        spacesList.appendChild(containerEl);

        if (!firstItemAppended) firstItemAppended = true;
        if (animate && firstItemAppended) await wait(itemDelay);
    }

    populateSVGs();
}

window.addEventListener('tabchange', (event) => {
    const eventDetails = event as CustomEvent<TabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'selectSpace') {
        init();
        populateSpacesList();
    }
});