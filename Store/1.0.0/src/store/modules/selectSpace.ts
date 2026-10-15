import { populateSVGs } from "./fileLoader";
import { showNotification, showPopup } from "./notifications";
import { preferences } from "./settings";

import { electroview, exit, restart } from "./index";
import { type tabChangeEventDetail } from "../../rpc/store-types";
import { gotoWorkspace } from "./workspace";
import { createRandomSpace } from "./createSpace";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let isInitialized: boolean = false;

const fadeOutAnimation = "nivixFadeOut 0.1s var(--transition-easing-style, ease-out) forwards";
const fadeInAnimation = "nivixFadeIn 0.2s var(--transition-easing-style, ease-out) forwards";
const programaticAnimationDuration = 200;
const itemDelay = 25; // Adjust this (in ms) to make the staggered pops faster or slower

const sourceCodeBtn = getEBD<HTMLButtonElement>('selectSpace-source');
const issuesBtn = getEBD<HTMLButtonElement>('selectSpace-issues');
const exitBtn = getEBD<HTMLButtonElement>('selectSpace-exit');
const restartBtn = getEBD<HTMLButtonElement>('selectSpace-restart');
const refreshBtn = getEBD<HTMLButtonElement>('selectSpace-refresh');
const createBtn = getEBD<HTMLButtonElement>('selectSpace-create');
const searchInput = getEBD<HTMLInputElement>('selectSpace-search');

export async function init() {
    if (isInitialized) return;
    
    sourceCodeBtn.addEventListener('click', function() {
        window.open('https://github.com/SqueakyLlama1/nivix-studio-dev/tree/main/Store/1.0.0', '_blank');
    });
    
    issuesBtn.addEventListener('click', function() {
        window.open('https://github.com/SqueakyLlama1/nivix-studio-dev/issues', '_blank');
    });
    
    exitBtn.addEventListener('click', exit);
    restartBtn.addEventListener('click', restart);

    createBtn.addEventListener('click', async (event: MouseEvent) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        if (createBtn.disabled) return;
        createBtn.disabled = true;
        try {
            const { name, id } = await createRandomSpace();
            showNotification(`Created random space '${name}' (ID: ${id})`);
            await populateSpacesList(true, preferences['transitionAnimations']);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(`Failed to create random space: ${message}`, 'error');
        } finally {
            createBtn.disabled = false;
        }
    });
    
    refreshBtn.addEventListener('click', (e: MouseEvent) => {
        populateSpacesList(true, preferences['transitionAnimations'] && !e.shiftKey);
    });
    searchInput.addEventListener('input', updateSpaceSearch);
    
    isInitialized = true;
}

async function populateSpacesList(fadeOut?: boolean, animate: boolean = preferences['transitionAnimations']): Promise<void> {
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
        const identifierEl = document.createElement('span');
        const continueBtn = document.createElement('button');
        const actionsContainerEl = document.createElement('div');
        const deleteBtn = document.createElement('button');
        const renameBtn = document.createElement('button');
        const dividerEl = document.createElement('hr');
        
        containerEl.className = 'item center';
        containerEl.dataset['spaceName'] = space.name;
        containerEl.dataset['spaceId'] = String(space.id);
        headerEl.className = 'space-header';
        
        iconButtonEl.type = 'button';
        iconButtonEl.className = 'space-icon-button';
        
        iconEl.className = 'space-icon';
        const defaultIconSrc = new URL('assets/favicon.png', import.meta.url).href;
        const spaceImage = space.imageBase64;
        iconEl.src = typeof spaceImage === 'string' && spaceImage.trim()
            ? spaceImage
            : defaultIconSrc;
        iconEl.onerror = () => {
            iconEl.onerror = null;
            if (iconEl.src !== defaultIconSrc) iconEl.src = defaultIconSrc;
        };
        iconEl.alt = '';
        
        editIndicatorEl.className = 'space-icon-edit';
        editSvgPlaceholderEl.textContent = 'assets/svg/edit.svg';
        editIndicatorEl.appendChild(editSvgPlaceholderEl);
        iconButtonEl.append(iconEl, editIndicatorEl);
        
        nameEl.className = 'name-column';
        nameEl.innerText = space.name;
        
        identifierEl.className = 'id-column';
        identifierEl.innerText = `ID: ${space.id}`;
        
        continueBtn.textContent = 'Open';
        continueBtn.className = 'nivix-primary-button primary continue-button';
        continueBtn.onclick = () => gotoWorkspace(space.id);
        
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'nivix-secondary-button';
        
        renameBtn.textContent = 'Rename';
        renameBtn.className = 'nivix-secondary-button';
        renameBtn.onclick = async () => {
            const newName = await showPopup(
                `Renaming Space`,
                `Enter a new name for "${space.name}"`,
                'text',
                undefined,
                { placeholder: 'New Name', maxlength: 128 }
            );
            
            if (newName && newName !== space.name) {
                try {
                    await electroview.rpc!.request.updateSpace({ id: space.id, updates: { name: newName } });
                    await populateSpacesList(true);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    showNotification(`Failed to rename space '${space.name}': ${message}`, 'error');
                }
            }
        };
        
        let firstItemAppended = false;
        
        deleteBtn.onclick = async (e: MouseEvent) => {
            const verified = e.shiftKey ? true : await showPopup(
                'Confirm Space Deletion?', `Name: "${space.name}"<br>ID: ${space.id}<br></div><br><b>This cannot be undone.</b>`,
                'options',
                [
                    { content: 'Cancel', value: false, highlighted: true },
                    { content: 'Delete', value: true, highlighted: false }
                ]
            );
            
            if (verified) {
                try {
                    await electroview.rpc!.request.deleteSpace(space.id);
                    showNotification(`Deleted Space '${space.name}'`);
                    populateSpacesList(true, preferences['transitionAnimations'] && !e.shiftKey);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    showNotification(`Failed to delete space '${space.name}': ${message}`, 'error');
                }
            }
        };
        
        iconButtonEl.onclick = async () => {
            const files = await showPopup(
                `Set an image for space '${space.name}'`,
                'Upload an image file for your space. We recommend a 1:1 aspect ratio image that is at least 512 x 512.',
                'file',
                [
                    { content: 'Cancel', value: false, highlighted: false },
                    { content: 'Reset to Default', value: 'reset', highlighted: false },
                    { content: 'Set', value: 'inputValue', highlighted: true }
                ],
                { multiple: false, accept: "image/png, image/jpeg, image/gif, image/webp, image/svg+xml, image/avif, image/bmp, image/x-icon" }
            );

            if (files === 'reset') {
                await electroview.rpc!.request.updateSpace({
                    id: space.id,
                    updates: { imageBase64: "" }
                });
                showNotification(`Reset image for space ${space.name}`);
                populateSpacesList();
                return;
            }
            
            if (files && files.length > 0) {
                const file = files[0];
                
                try {
                    const imageBase64 = await convertFileToBase64(file);
                    await electroview.rpc!.request.updateSpace({
                        id: space.id,
                        updates: { imageBase64 }
                    });
                    await populateSpacesList(true);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    showNotification(`Failed to update space image: ${message}`, 'error');
                }
            }
            
            function convertFileToBase64(file: File): Promise<string> {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = (error) => reject(error);
                    
                    reader.readAsDataURL(file);
                });
            }
        };
        
        headerEl.append(iconButtonEl, nameEl, identifierEl);
        
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
    updateSpaceSearch();
}

function updateSpaceSearch(): void {
    const spacesList = getEBD<HTMLDivElement>('selectSpace-list');
    const searchTerm = searchInput.value.trim().toLocaleLowerCase();
    const items = Array.from(spacesList.querySelectorAll<HTMLElement>('.item'));

    if (items.length === 0) return;

    let matchingItems = 0;
    for (const item of items) {
        const searchableText = `${item.dataset['spaceName'] ?? ''} ${item.dataset['spaceId'] ?? ''}`
            .toLocaleLowerCase();
        item.hidden = !searchableText.includes(searchTerm);
        item.style.display = item.hidden ? 'none' : '';
        if (!item.hidden) matchingItems++;
    }

    let emptyState = spacesList.querySelector<HTMLElement>('.search-empty-state');
    if (matchingItems === 0) {
        if (!emptyState) {
            emptyState = document.createElement('div');
            emptyState.className = 'center search-empty-state';
            emptyState.setAttribute('role', 'status');
            spacesList.appendChild(emptyState);
        }
        emptyState.textContent = `No spaces found for "${searchInput.value.trim()}".`;
    } else {
        emptyState?.remove();
    }
}

window.addEventListener('tabChange', (event) => {
    const eventDetails = event as CustomEvent<tabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'selectSpace') {
        init();
        populateSpacesList();
    }
});