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
        container.className = "notification-box";
        container.setAttribute("role", "status");
        container.setAttribute("aria-live", "polite");
        
        const header = document.createElement("div");
        header.className = "notification-header";
        
        const title = document.createElement("span");
        title.className = "notification-title";
        title.textContent = `Showing ${item.type[0].toUpperCase()}${item.type.slice(1)}`;
        
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
        
        let inputElement: HTMLInputElement | HTMLSelectElement | null = null;
        
        if (type !== "options") {
            if (type === "select") {
                const selectElement = document.createElement("select");
                inputProps.selectOptions?.forEach(option => {
                    selectElement.add(new Option(option, option));
                });
                inputElement = selectElement;
            } else {
                inputElement = document.createElement("input");
                inputElement.type = type;
            }
            inputElement.className = "nivix-input";
            
            if (type === "color" && inputElement instanceof HTMLInputElement) {
                const colorPickerContainer = document.createElement("div");
                colorPickerContainer.className = "custom-color-picker-widget";
                
                // 1. Color Preview Box
                const previewBox = document.createElement("div");
                previewBox.className = "popup-color-preview";
                
                // 2. Saturation/Brightness 2D Area (Canvas)
                const svCanvas = document.createElement("canvas");
                svCanvas.className = "popup-sv-canvas";
                const svCtx = svCanvas.getContext("2d", { willReadFrequently: true });
                
                // 3. Hue Slider
                const hueSlider = document.createElement("input");
                hueSlider.type = "range";
                hueSlider.min = "0";
                hueSlider.max = "360";
                hueSlider.value = "0";
                hueSlider.className = "popup-hue-slider";
                
                let currentHex = typeof inputProps.value === "string" && /^#[\da-f]{6}$/i.test(inputProps.value)
                ? inputProps.value
                : "#000000";
                
                function hexToHsv(hex: string) {
                    let r = parseInt(hex.slice(1, 3), 16) / 255;
                    let g = parseInt(hex.slice(3, 5), 16) / 255;
                    let b = parseInt(hex.slice(5, 7), 16) / 255;
                    let max = Math.max(r, g, b), min = Math.min(r, g, b);
                    let h = 0, s = 0, v = max;
                    let d = max - min;
                    s = max === 0 ? 0 : d / max;
                    if (max !== min) {
                        switch (max) {
                            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                            case g: h = (b - r) / d + 2; break;
                            case b: h = (r - g) / d + 4; break;
                        }
                        h /= 6;
                    }
                    return { h: h * 360, s: s * 100, v: v * 100 };
                }
                
                function hsvToHex(h: number, s: number, v: number): string {
                    s /= 100; v /= 100;
                    let c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
                    let r = 0, g = 0, b = 0;
                    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
                    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
                    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
                    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
                    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
                    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
                    let rr = Math.round((r + m) * 255).toString(16).padStart(2, '0');
                    let gg = Math.round((g + m) * 255).toString(16).padStart(2, '0');
                    let bb = Math.round((b + m) * 255).toString(16).padStart(2, '0');
                    return `#${rr}${gg}${bb}`.toUpperCase();
                }
                
                let { h: currentH, s: currentS, v: currentV } = hexToHsv(currentHex);
                hueSlider.value = String(currentH);
                
                // Append early so we can accurately measure the layout width for crisp canvas rendering
                colorPickerContainer.append(previewBox, svCanvas, hueSlider);
                
                inputElement.type = "text";
                inputElement.className = "nivix-input popup-color-hex";
                inputElement.placeholder = "#RRGGBB";
                inputElement.setAttribute("aria-label", "Hex color value");
                inputElement.required = true;
                inputElement.pattern = "#[\\da-fA-F]{6}";
                inputElement.value = currentHex;
                previewBox.style.backgroundColor = currentHex;
                
                Object.entries(inputProps).forEach(([key, val]) => {
                    if (key !== "value" && key !== "selectOptions" && key !== "required" && val !== undefined && val !== null) {
                        if (typeof val === "boolean") inputElement!.toggleAttribute(key, val);
                        else inputElement!.setAttribute(key, String(val));
                    }
                });
                
                const hexLabel = document.createElement("label");
                hexLabel.className = "popup-color-hex-label";
                hexLabel.textContent = "Hex value";
                hexLabel.append(inputElement);
                
                messageContainer.append(colorPickerContainer, hexLabel);
                
                // Setup high-DPI sharp canvas dimensions based on real container layout width
                const dpr = window.devicePixelRatio || 1;
                const displayWidth = svCanvas.clientWidth || 280;
                const displayHeight = 140;
                
                svCanvas.width = displayWidth * dpr;
                svCanvas.height = displayHeight * dpr;
                svCtx?.scale(dpr, dpr);
                
                function drawSVBox(hue: number, s: number, v: number) {
                    if (!svCtx) return;
                    svCtx.clearRect(0, 0, displayWidth, displayHeight);
                    
                    // Base hue background
                    svCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                    svCtx.fillRect(0, 0, displayWidth, displayHeight);
                    
                    // White gradient (horizontal)
                    let gradWhite = svCtx.createLinearGradient(0, 0, displayWidth, 0);
                    gradWhite.addColorStop(0, "rgba(255,255,255,1)");
                    gradWhite.addColorStop(1, "rgba(255,255,255,0)");
                    svCtx.fillStyle = gradWhite;
                    svCtx.fillRect(0, 0, displayWidth, displayHeight);
                    
                    // Black gradient (vertical)
                    let gradBlack = svCtx.createLinearGradient(0, 0, 0, displayHeight);
                    gradBlack.addColorStop(0, "rgba(0,0,0,0)");
                    gradBlack.addColorStop(1, "rgba(0,0,0,1)");
                    svCtx.fillStyle = gradBlack;
                    svCtx.fillRect(0, 0, displayWidth, displayHeight);
                    
                    // Draw Crosshair Indicator
                    const cx = (s / 100) * displayWidth;
                    const cy = (1 - v / 100) * displayHeight;
                    
                    svCtx.strokeStyle = v > 50 && s < 50 ? "#000000" : "#ffffff";
                    svCtx.lineWidth = 2;
                    svCtx.beginPath();
                    svCtx.arc(cx, cy, 5, 0, 2 * Math.PI);
                    svCtx.stroke();
                }
                
                const updateFromHSV = (h: number, s: number, v: number, updateInput = true) => {
                    currentHex = hsvToHex(h, s, v);
                    if (updateInput) inputElement!.value = currentHex;
                    previewBox.style.backgroundColor = currentHex;
                    drawSVBox(h, s, v);
                };
                
                const handleSVInteraction = (e: MouseEvent | TouchEvent) => {
                    const rect = svCanvas.getBoundingClientRect();
                    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
                    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
                    
                    let x = clientX - rect.left;
                    let y = clientY - rect.top;
                    x = Math.max(0, Math.min(x, rect.width));
                    y = Math.max(0, Math.min(y, rect.height));
                    
                    currentS = (x / rect.width) * 100;
                    currentV = (1 - y / rect.height) * 100;
                    
                    updateFromHSV(currentH, currentS, currentV);
                };
                
                svCanvas.addEventListener("pointerdown", (e) => {
                    svCanvas.setPointerCapture(e.pointerId);
                    handleSVInteraction(e);
                });
                svCanvas.addEventListener("pointermove", (e) => {
                    if (e.buttons > 0 || e.pressure > 0) {
                        handleSVInteraction(e);
                    }
                });
                
                hueSlider.addEventListener("input", () => {
                    currentH = parseFloat(hueSlider.value);
                    updateFromHSV(currentH, currentS, currentV);
                });
                
                inputElement.addEventListener("input", () => {
                    const isValidHex = /^#[\da-f]{6}$/i.test(inputElement!.value);
                    inputElement!.setCustomValidity(isValidHex ? "" : "Enter a color in #RRGGBB format.");
                    if (isValidHex) {
                        currentHex = inputElement!.value;
                        let hsv = hexToHsv(currentHex);
                        currentH = hsv.h;
                        currentS = hsv.s;
                        currentV = hsv.v;
                        hueSlider.value = String(currentH);
                        previewBox.style.backgroundColor = currentHex;
                        drawSVBox(currentH, currentS, currentV);
                    }
                });
                
                drawSVBox(currentH, currentS, currentV);
            } else {
                Object.entries(inputProps).forEach(([key, val]) => {
                    if (key !== "selectOptions" && val !== undefined && val !== null) {
                        if (typeof val === "boolean") inputElement!.toggleAttribute(key, val);
                        else inputElement!.setAttribute(key, String(val));
                    }
                });
                if (inputProps.value !== undefined) inputElement.value = String(inputProps.value);
                messageContainer.appendChild(inputElement);
            }
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
            if (type === "color" && targetOpt?.value === "inputValue" &&
                inputElement instanceof HTMLInputElement && !inputElement.reportValidity()) return;
                
                const inputValue = inputElement instanceof HTMLInputElement && inputElement.type === "file"
                ? inputElement.files
                : inputElement?.value;
                const val = targetOpt?.value === "inputValue"
                ? inputValue
                : (targetOpt ? targetOpt.value : inputValue);
                closePopup(val);
            };
            
            effectiveOptions.forEach((opt) => {
                const btn = document.createElement("button");
                btn.textContent = opt.content;
                btn.className = opt.highlighted ? "nivix-primary-button primary" : "nivix-secondary-button";
                if (opt.highlighted) highlightedButton = btn;
                
                btn.addEventListener("click", () => {
                    if (type === "color" && opt.value === "inputValue" &&
                        inputElement instanceof HTMLInputElement && !inputElement.reportValidity()) return;
                        const inputValue = inputElement instanceof HTMLInputElement && inputElement.type === "file"
                        ? inputElement.files
                        : inputElement?.value;
                        const val = opt.value === "inputValue"
                        ? inputValue
                        : opt.value;
                        closePopup(val);
                    });
                    actionContainer.appendChild(btn);
                });
                
                if (inputElement instanceof HTMLInputElement) {
                    inputElement.addEventListener("keydown", (e) => {
                        if (e.key === "Enter" && type !== "select" && type !== "range" && type !== "color") {
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