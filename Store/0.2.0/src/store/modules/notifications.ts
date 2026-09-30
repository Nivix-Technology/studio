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
    | "datetime-local";

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
    [key: string]: any; // Allow any additional standard HTML input attributes
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
        
        const messageOutput = document.createElement("p");
        messageOutput.className = "notification-message";
        messageOutput.textContent = item.message;
        
        const closeBtn = document.createElement("button");
        closeBtn.className = "notification-close";
        closeBtn.setAttribute("aria-label", "Dismiss notification");
        closeBtn.innerHTML = "&times;";
        
        container.appendChild(messageOutput);
        container.appendChild(closeBtn);
        if (!preferences['disableAnimations']) container.style.animation = "nivixFadeIn 0.3s ease-out forwards";
        document.body.appendChild(container);
        
        let dismissTimer: number | null = null;
        let isDismissed = false;
        
        const dismiss = () => {
            if (isDismissed) return;
            isDismissed = true;
            
            if (dismissTimer !== null) {
                clearTimeout(dismissTimer);
            }
            
            if (preferences['disableAnimations']) {
                container.remove();
                resolve();
                return;
            }

            container.style.animation = "nivixFadeOut 0.25s ease-out forwards";
            
            container.addEventListener("animationend", () => {
                container.remove();
                resolve();
            }, { once: true });
        };
        
        closeBtn.addEventListener("click", dismiss);
        
        if (!item.sticky) {
            dismissTimer = window.setTimeout(dismiss, item.duration);
        }
    });
}

export function showPopup<T = any>(
    message: string, 
    type: PopupType = "options",
    options: PopupOption[] = [
        { content: "No", value: false, highlighted: false },
        { content: "Yes", value: true, highlighted: true }
    ],
    inputProps: PopupInputAttributes = {}
): Promise<T> {
    return new Promise((resolve) => {
        // Create strict structural hierarchy
        const popupContainer = document.createElement("div");
        popupContainer.className = "popup-container center";

        const popup = document.createElement("div");
        popup.className = "popup";

        const messageContainer = document.createElement("div");
        messageContainer.className = "message-container";

        const span = document.createElement("span");
        span.innerHTML = message;
        messageContainer.appendChild(span);

        let inputElement: HTMLInputElement | null = null;

        // If type is not "options", generate the requested input field
        if (type !== "options") {
            inputElement = document.createElement("input");
            inputElement.type = type;
            inputElement.className = "nivix-input";

            // Apply all passed attributes dynamically
            Object.entries(inputProps).forEach(([key, val]) => {
                if (val !== undefined && val !== null) {
                    inputElement!.setAttribute(key, String(val));
                }
            });

            messageContainer.appendChild(inputElement);
        }

        const actionContainer = document.createElement("div");
        actionContainer.className = "action-container";

        const disableAnimations = preferences['disableAnimations'];

        // Apply distinct animations for container and popup wrapper
        if (!disableAnimations) {
            popupContainer.style.animation = "popupFadeIn 0.3s ease-out forwards";
            popup.style.animation = "nivixFadeIn 0.3s ease-out forwards";
        }

        let isClosing = false;
        const closePopup = (selectedValue: any) => {
            if (isClosing) return;
            isClosing = true;

            if (disableAnimations) {
                popupContainer.remove();
                resolve(selectedValue as T);
                return;
            }

            popupContainer.style.animation = "popupFadeOut 0.3s ease-out forwards";
            popup.style.animation = "nivixFadeOut 0.3s ease-out forwards";

            popupContainer.addEventListener("animationend", () => {
                popupContainer.remove();
                resolve(selectedValue as T);
            }, { once: true });
        };

        // Render input single "OK" button OR custom option buttons
        if (type !== "options") {
            const okBtn = document.createElement("button");
            okBtn.textContent = "OK";
            okBtn.className = "nivix-primary-button";

            const submitInput = () => {
                closePopup(inputElement ? inputElement.value : "");
            };

            okBtn.addEventListener("click", submitInput);

            // Allow pressing "Enter" inside the input to submit
            if (inputElement) {
                inputElement.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        submitInput();
                    }
                });
            }

            actionContainer.appendChild(okBtn);
        } else {
            options.forEach((opt) => {
                const btn = document.createElement("button");
                btn.textContent = opt.content;
                btn.className = opt.highlighted ? "nivix-primary-button" : "nivix-secondary-button";
                
                btn.addEventListener("click", () => closePopup(opt.value));
                actionContainer.appendChild(btn);
            });
        }

        // Assemble strict layout elements
        popup.appendChild(messageContainer);
        popup.appendChild(actionContainer);
        popupContainer.appendChild(popup);
        document.body.appendChild(popupContainer);

        // Auto-focus input field if present
        if (inputElement) {
            requestAnimationFrame(() => inputElement?.focus());
        }
    });
}