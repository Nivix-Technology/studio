import { loadCSS } from "./file-loader";
import { showNotification, showPopup } from "./notifications";
import { preferences } from "./settings";

import { electroview } from "./index";
import { type TabChangeEventDetail } from "../../shared/bun/store-types";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let isInitialized: boolean = false;

const fadeOutAnimation = "nivixFadeOut 0.2s ease-out forwards";
const fadeInAnimation = "nivixFadeIn 0.3s ease-out forwards";
const programaticAnimationDuration = 200;
const itemDelay = 25; // Adjust this (in ms) to make the staggered pops faster or slower

const refreshBtn = getEBD<HTMLButtonElement>('manageSpaces-refresh');

export function init(): void {
    if (isInitialized) return;

    loadCSS('sheets/manageSpaces.css');

    refreshBtn.addEventListener('click', (e: MouseEvent) => {
        populateSpacesList(true, !e.shiftKey);
    });

    isInitialized = true;
}

async function populateSpacesList(fadeOut?: boolean, animate: boolean = !preferences['disableAnimations']): Promise<void> {
    const spacesList = getEBD<HTMLDivElement>('manageSpaces-list');

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
        spacesList.innerHTML = `<div class="center">You have no spaces. Click 'Create New' at the bottom of this menu to get started!</div>`;
    }

    // Sequentially build and append items so they pop up one by one
    for (const space of spaces) {
        const containerEl = document.createElement('div');
        const nameEl = document.createElement('span');
        const actionsContainerEl = document.createElement('div');
        const renameBtn = document.createElement('button');
        const deleteBtn = document.createElement('button');

        containerEl.className = 'item';
        nameEl.className = 'name-column';
        nameEl.innerText = space.name;

        renameBtn.textContent = 'Rename';
        renameBtn.className = 'nivix-primary-button';
        renameBtn.onclick = async () => {
            const newName = await showPopup(
                `Renaming '${space.name}'`,
                "text", 
                undefined, 
                { placeholder: "New Name" }
            );

            if (newName && newName !== space.name) {
                await electroview.rpc!.request.renameSpace({ id: space.id, name: newName });
                populateSpacesList(true);
            }
        };

        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'nivix-primary-button';
        deleteBtn.onclick = async (e: MouseEvent) => {
            const verified = e.shiftKey ? true : await showPopup(
                `Are you sure you want to delete the space '${space.name}'? This cannot be undone.`, 
                "options", 
                [
                    { content: "No", value: false, highlighted: true }, 
                    { content: "Yes", value: true, highlighted: false }
                ]
            );

            if (verified) {
                try {
                    await electroview.rpc!.request.deleteSpace(space.id);
                    showNotification(`Deleted Space '${space.name}'`);
                    populateSpacesList(true, !e.shiftKey);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    showNotification(`Failed to delete space '${space.name}': ${message}`, "error");
                }
            }
        };

        actionsContainerEl.className = 'actions';
        actionsContainerEl.appendChild(renameBtn);
        actionsContainerEl.appendChild(deleteBtn);

        containerEl.appendChild(nameEl);
        containerEl.appendChild(actionsContainerEl);

        // Apply fade/pop animation if enabled in preferences
        if (animate) containerEl.style.animation = fadeInAnimation;

        // Append to DOM immediately
        spacesList.appendChild(containerEl);

        // Stagger delay before appending the next item
        if (animate) await wait(itemDelay);
    }
}

window.addEventListener('tabchange', (event) => {
    const eventDetails = event as CustomEvent<TabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'manageSpaces') {
        init();
        populateSpacesList();
    }
});