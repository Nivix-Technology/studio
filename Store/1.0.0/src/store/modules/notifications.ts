import { preferences } from "./settings";
import { ColorPicker, PopupPlacer } from "./playpentech";

interface NotificationItem {
    message: string;
    type: ValidNotificationType;
    duration: number;
    sticky: boolean;
}

export type ValidNotificationType =
    | "warning"
    | "info"
    | "error";

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
    | "file"
    | "range"
    | "color";

export type PopupType = "options" | "select" | ValidInputType;

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
    selectOptions?: string[];
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
        closeBtn.innerHTML = "&times;";
        
        header.append(title, closeBtn);
        container.append(header, messageOutput);
        
        if (preferences['transitionAnimations']) {
            container.style.animation = "playpenFadeIn 0.3s var(--transition-easing-style, ease-out) forwards";
        }
        document.body.appendChild(container);
        
        let dismissTimer: number | null = null;
        let isDismissed = false;
        
        const dismiss = (event?: MouseEvent) => {
            if (isDismissed) return;
            
            if (event && event.shiftKey) {
                queue.length = 0;
            }
            
            isDismissed = true;
            
            if (dismissTimer !== null) {
                clearTimeout(dismissTimer);
            }
            
            if (!preferences['transitionAnimations']) {
                container.remove();
                resolve();
                return;
            }
            
            container.style.animation = "playpenFadeOut 0.25s var(--transition-easing-style, ease-out) forwards";
            container.addEventListener("animationend", () => {
                container.remove();
                resolve();
            }, { once: true });
        };
        
        closeBtn.addEventListener("click", (event) => dismiss(event));
        
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
    inputProps: PopupInputAttributes = {},
    center: boolean = false
): Promise<T | undefined> {
    const activeElement = document.activeElement;
    const anchor = activeElement instanceof HTMLElement
        ? activeElement.closest("button")
        : null;

    dismissActivePopup?.();

    return new Promise((resolve) => {
        const popupContainer = document.createElement("div");
        popupContainer.className = "popup-container";
        
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
        
        let inputElement: HTMLInputElement | HTMLSelectElement | null = null;
        let colorPickerInstance: ColorPicker | null = null;
        
        if (type !== "options") {
            if (type === "select") {
                const selectElement = document.createElement("select");
                inputProps.selectOptions?.forEach(option => {
                    selectElement.add(new Option(option, option));
                });
                inputElement = selectElement;
                inputElement.className = "playpen-input";
            } else if (type === "color") {
                colorPickerInstance = new ColorPicker(inputProps.value);
                colorPickerInstance.mount(messageContainer);
                inputElement = colorPickerInstance.inputElement;
            } else {
                inputElement = document.createElement("input");
                inputElement.type = type;
                inputElement.className = "playpen-input";
            }

            if (type !== "color") {
                Object.entries(inputProps).forEach(([key, val]) => {
                    if (key !== "selectOptions" && val !== undefined && val !== null) {
                        if (typeof val === "boolean") inputElement!.toggleAttribute(key, val);
                        else inputElement!.setAttribute(key, String(val));
                    }
                });
                if (inputProps.value !== undefined && inputElement) inputElement.value = String(inputProps.value);
                messageContainer.appendChild(inputElement);
            }
        }
        
        const actionContainer = document.createElement("div");
        actionContainer.className = "action-container";
        let highlightedButton: HTMLButtonElement | null = null;
        
        const transitionAnimations = preferences['transitionAnimations'];
        let isClosing = false;
        let outsidePointerDown: ((event: PointerEvent) => void) | null = null;
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
        };
        
        const closePopup = (selectedValue: any, immediately = false) => {
            if (immediately || isClosing) {
                if (!isClosing && immediately) isClosing = true;
                removeOutsideListener();
                popupContainer.remove();
                clearActivePopup();
                resolve(selectedValue as T | undefined);
                return;
            }
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

            popup.addEventListener("animationend", animationEnded, { once: true });
            popup.style.animation = "playpenFadeOut 0.3s var(--transition-easing-style, ease-out) forwards";

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

        const getSelectedInputValue = () => 
            inputElement instanceof HTMLInputElement && inputElement.type === "file"
                ? inputElement.files
                : inputElement?.value;

        const handleOptionSelection = (optValue: any) => {
            if (type === "color" && optValue === "inputValue" &&
                inputElement instanceof HTMLInputElement && !inputElement.reportValidity()) {
                return;
            }
            const val = optValue === "inputValue" ? getSelectedInputValue() : optValue;
            closePopup(val);
        };

        effectiveOptions.forEach((opt) => {
            const btn = document.createElement("button");
            btn.textContent = opt.content;
            btn.className = opt.highlighted ? "playpen-primary-button primary" : "playpen-primary-button";
            if (opt.highlighted) highlightedButton = btn;
            
            btn.addEventListener("click", () => handleOptionSelection(opt.value));
            actionContainer.appendChild(btn);
        });

        if (inputElement instanceof HTMLInputElement) {
            inputElement.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !["select", "range", "color"].includes(type)) {
                    e.preventDefault();
                    const targetOpt = effectiveOptions.find(o => o.highlighted && o.value === "inputValue") || 
                                      effectiveOptions.find(o => o.value === "inputValue") ||
                                      effectiveOptions[effectiveOptions.length - 1];
                    handleOptionSelection(targetOpt?.value);
                }
            });
        }
        
        popup.appendChild(titleBar);
        popup.appendChild(messageContainer);
        popup.appendChild(actionContainer);
        popupContainer.appendChild(popup);
        document.body.appendChild(popupContainer);

        // Position using either center fallback or external placer
        if (center) {
            popupContainer.classList.add("center", "popup-container-shaded");
        } else {
            PopupPlacer.place(popupContainer, popup, anchor);
        }

        outsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && !popup.contains(target) && !anchor?.contains(target)) {
                closePopup(undefined);
            }
        };
        document.addEventListener("pointerdown", outsidePointerDown);

        if (transitionAnimations) {
            popup.style.animation = "playpenFadeIn 0.3s var(--transition-easing-style, ease-out) forwards";
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