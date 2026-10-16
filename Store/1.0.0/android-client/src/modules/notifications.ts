import { preferences } from "./settings";

interface NotificationItem {
    message: string;
    type: ValidNotificationType;
    duration: number;
    sticky: boolean;
}

export type ValidNotificationType =
| "warning"
| "info"
| "error"

export interface PopupOption {
    content: string;
    value: any;
    highlighted?: boolean;
}

export type ValidInputType = 
| "text" 
| "number" 
| "password" 
| "email" 
| "url" 
| "tel" 
| "search" 
| "date" 
| "time" 
| "datetime-local"
| "file";

export type PopupType = "options" | ValidInputType;

export interface PopupInputAttributes {
    placeholder?: string;
    value?: string | number;
    minlength?: number;
    maxlength?: number;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    pattern?: string;
    required?: boolean;
    readonly?: boolean;
    disabled?: boolean;
    autocomplete?: string;
    accept?: string;
    multiple?: boolean;
    [key: string]: any;
}

const queue: NotificationItem[] = [];
let isProcessing = false;

export function showNotification(
    message: string, 
    type: ValidNotificationType = "info", 
    duration: number = 3000, 
    sticky: boolean = type === "error"
): void {
    queue.push({ message, type, duration, sticky });
    
    if (!isProcessing) {
        processQueue();
    }
}

async function processQueue(): Promise<void> {
    if (queue.length === 0) {
        isProcessing = false;
        return;
    }
    
    isProcessing = true;
    const current = queue.shift()!;
    
    await renderNotification(current);
    
    processQueue();
}

function renderNotification(item: NotificationItem): Promise<void> {
    return new Promise((resolve) => {
        const container = document.createElement("div");
        container.className = `notification-box ${item.type}`;
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");

        const header = document.createElement("div");
        header.className = "notification-header";

        const title = document.createElement("span");
        title.className = "notification-title";
        title.textContent = `${item.type[0].toUpperCase()}${item.type.slice(1)}`;
        
        const messageOutput = document.createElement("p");
        messageOutput.className = "notification-message";
        messageOutput.textContent = item.message;
        
        const closeBtn = document.createElement("button");
        closeBtn.className = "notification-close";
        closeBtn.setAttribute("aria-label", "Dismiss notification");
        closeBtn.innerHTML = "&times;";
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        container.appendChild(header);
        container.appendChild(messageOutput);
        if (preferences['transitionAnimations']) container.style.animation = "nivixFadeIn 0.3s var(--transition-easing-style, ease-out) forwards";
        document.body.appendChild(container);
        
        let dismissTimer: number | null = null;
        let isDismissed = false;
        
        const dismiss = () => {
            if (isDismissed) return;
            
            isDismissed = true;
            
            if (dismissTimer !== null) {
                clearTimeout(dismissTimer);
            }
            
            if (!preferences['transitionAnimations']) {
                container.remove();
                resolve();
                return;
            }
            
            container.style.animation = "nivixFadeOut 0.25s var(--transition-easing-style, ease-out) forwards";
            
            container.addEventListener("animationend", () => {
                container.remove();
                resolve();
            }, { once: true });
        };
        
        closeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            dismiss();
        });
        
        if (!item.sticky) {
            dismissTimer = window.setTimeout(() => dismiss(), item.duration);
        }
    });
}

let dismissActivePopup: (() => void) | null = null;

export function showPopup<T = any>(
    title: string,
    message: string, 
    type: PopupType = "options",
    options: PopupOption[] = [
        { content: "No", value: false, highlighted: false },
        { content: "Yes", value: true, highlighted: true }
    ],
    inputProps: PopupInputAttributes = {}
): Promise<T | undefined> {
    dismissActivePopup?.();

    return new Promise((resolve) => {
        const popupContainer = document.createElement("div");
        popupContainer.className = "popup-container";
        popupContainer.classList.add("center", "popup-container-shaded");
        
        const popup = document.createElement("div");
        popup.className = "popup";

        const titleBar = document.createElement("div");
        titleBar.className = "popup-title-bar";

        const titleOutput = document.createElement("span");
        titleOutput.className = "popup-title";
        titleOutput.textContent = title;
        titleBar.appendChild(titleOutput);
        
        const messageContainer = document.createElement("div");
        messageContainer.className = "message-container";
        
        const span = document.createElement("span");
        span.innerHTML = message;
        messageContainer.appendChild(span);
        
        let inputElement: HTMLInputElement | null = null;
        
        if (type !== "options") {
            inputElement = document.createElement("input");
            inputElement.type = type;
            inputElement.className = "nivix-input";
            
            Object.entries(inputProps).forEach(([key, val]) => {
                if (val !== undefined && val !== null) {
                    if (typeof val === "boolean") inputElement!.toggleAttribute(key, val);
                    else inputElement!.setAttribute(key, String(val));
                }
            });
            
            messageContainer.appendChild(inputElement);
        }
        
        const actionContainer = document.createElement("div");
        actionContainer.className = "action-container";
        let highlightedButton: HTMLButtonElement | null = null;
        
        const transitionAnimations = preferences['transitionAnimations'];
        let isClosing = false;
        let outsidePointerDown: ((event: PointerEvent) => void) | null = null;
        let trapTabNavigation: ((event: KeyboardEvent) => void) | null = null;
        let dismissThisPopup: (() => void) | null = null;
        const clearActivePopup = () => {
            if (dismissActivePopup === dismissThisPopup) {
                dismissActivePopup = null;
            }
        };
        const removeOutsideListener = () => {
            if (outsidePointerDown) {
                document.removeEventListener("pointerdown", outsidePointerDown);
                outsidePointerDown = null;
            }
            if (trapTabNavigation) {
                document.removeEventListener("keydown", trapTabNavigation);
                trapTabNavigation = null;
            }
        };
        
        const closePopup = (selectedValue: any, immediately = false) => {
            if (immediately) {
                isClosing = true;
                removeOutsideListener();
                popupContainer.remove();
                clearActivePopup();
                resolve(undefined);
                return;
            }
            if (isClosing) return;
            isClosing = true;
            removeOutsideListener();
            
            if (!transitionAnimations) {
                popupContainer.remove();
                clearActivePopup();
                resolve(selectedValue as T | undefined);
                return;
            }
            
            const isShaded = popupContainer.classList.contains("popup-container-shaded");
            const finishClose = () => {
                popupContainer.remove();
                clearActivePopup();
                resolve(selectedValue as T | undefined);
            };

            let pendingAnimations = isShaded ? 2 : 1;
            const animationEnded = () => {
                pendingAnimations -= 1;
                if (pendingAnimations === 0) finishClose();
            };

            popup.addEventListener("animationend", () => {
                animationEnded();
            }, { once: true });
            popup.style.animation = "nivixFadeOut 0.3s var(--transition-easing-style, ease-out) forwards";

            if (isShaded) {
                const onContainerAnimationEnd = (event: AnimationEvent) => {
                    if (event.target !== popupContainer) return;
                    popupContainer.removeEventListener("animationend", onContainerAnimationEnd);
                    animationEnded();
                };
                popupContainer.addEventListener("animationend", onContainerAnimationEnd);
                popupContainer.style.animation = "popupContainerFadeOut 0.3s var(--transition-easing-style, ease-out) forwards";
            }
        };
        dismissThisPopup = () => closePopup(undefined, true);
        dismissActivePopup = dismissThisPopup;
        
        const effectiveOptions = (type !== "options" && options.length === 2 && options[0].content === "No" && options[1].content === "Yes")
            ? [
                { content: "Cancel", value: undefined, highlighted: false },
                { content: "Set", value: "inputValue", highlighted: true }
              ]
            : options;

        const submitInput = () => {
            const targetOpt = effectiveOptions.find(o => o.highlighted && o.value === "inputValue") || 
                              effectiveOptions.find(o => o.value === "inputValue") ||
                              effectiveOptions[effectiveOptions.length - 1];
            
            const val = targetOpt?.value === "inputValue"
                ? (type === "file" ? inputElement?.files : inputElement?.value)
                : (targetOpt ? targetOpt.value : (type === "file" ? inputElement?.files : inputElement?.value));
            closePopup(val);
        };

        effectiveOptions.forEach((opt) => {
            const btn = document.createElement("button");
            btn.textContent = opt.content;
            btn.className = opt.highlighted ? "nivix-primary-button primary" : "nivix-secondary-button";
            if (opt.highlighted) highlightedButton = btn;
            
            btn.addEventListener("click", () => {
                const val = opt.value === "inputValue"
                    ? (type === "file" ? inputElement?.files : inputElement?.value)
                    : opt.value;
                closePopup(val);
            });
            actionContainer.appendChild(btn);
        });

        if (inputElement) {
            inputElement.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submitInput();
                }
            });
        }
        
        popup.appendChild(titleBar);
        popup.appendChild(messageContainer);
        popup.appendChild(actionContainer);
        popupContainer.appendChild(popup);
        document.body.appendChild(popupContainer);

        outsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (!popup.contains(target)) {
                closePopup(undefined);
            }
        };
        document.addEventListener("pointerdown", outsidePointerDown);

        trapTabNavigation = (event: KeyboardEvent) => {
            if (event.key !== "Tab" || isClosing) return;

            const focusableElements = Array.from(popup.querySelectorAll<HTMLElement>(
                'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
            )).filter((element) =>
                element.tabIndex >= 0 &&
                element.getClientRects().length > 0 &&
                getComputedStyle(element).visibility !== "hidden"
            );

            if (focusableElements.length === 0) {
                event.preventDefault();
                popup.tabIndex = -1;
                popup.focus();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            const activeIndex = focusableElements.indexOf(document.activeElement as HTMLElement);

            if (event.shiftKey && activeIndex <= 0) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && activeIndex === focusableElements.length - 1) {
                event.preventDefault();
                first.focus();
            } else if (activeIndex === -1) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        document.addEventListener("keydown", trapTabNavigation);

        if (transitionAnimations) {
            popup.style.animation = "nivixFadeIn 0.3s var(--transition-easing-style, ease-out) forwards";
            if (popupContainer.classList.contains("popup-container-shaded")) {
                popupContainer.style.animation = "popupContainerFadeIn 0.3s var(--transition-easing-style, ease-out) forwards";
            }
        }
        
        requestAnimationFrame(() => {
            if (isClosing || !popupContainer.isConnected) return;
            if (highlightedButton) {
                highlightedButton.focus();
            } else {
                inputElement?.focus();
            }
        });
    });
}