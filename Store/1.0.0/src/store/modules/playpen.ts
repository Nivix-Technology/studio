export function init(): void {
    const dependentCheckboxes = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-depends]'
    );

    dependentCheckboxes.forEach((dependentCheckbox) => {
        const dependency = getCheckboxDependency(dependentCheckbox);
        const existingListener = dependencyListeners.get(dependentCheckbox);
        if (!dependency) {
            if (existingListener) {
                existingListener.source.removeEventListener('change', existingListener.handler);
                dependencyListeners.delete(dependentCheckbox);
            }
            return;
        }

        if (
            existingListener?.source === dependency.source &&
            existingListener.expectedValue === dependency.expectedValue
        ) {
            const shouldBeChecked = dependency.expectedValue === 'checked';
            dependentCheckbox.disabled = dependency.source.checked !== shouldBeChecked;
            return;
        }

        if (existingListener) {
            existingListener.source.removeEventListener('change', existingListener.handler);
        }

        const updateState = () => {
            const shouldBeChecked = dependency.expectedValue === 'checked';
            dependentCheckbox.disabled = dependency.source.checked !== shouldBeChecked;
        };

        dependency.source.addEventListener('change', updateState);
        dependencyListeners.set(dependentCheckbox, {
            ...dependency,
            handler: updateState,
        });
        updateState();
    });

    initInputButtonLink();
    PopupPlacer.init();
}

const dependencyListeners = new WeakMap<HTMLInputElement, CheckboxDependencyListener>();

export async function waitForLoad(): Promise<void> {
    if (document.readyState !== 'complete') {
        await new Promise<void>((resolve) => {
            window.addEventListener('load', () => resolve(), { once: true });
        });
    }

    await document.fonts.ready;
}

function initInputButtonLink() {
    const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-input-link]');

    buttons.forEach(function(button) {
        const linkedElID = button.getAttribute('data-input-link') || "";

        const linkedEl = document.getElementById(linkedElID);

        button.addEventListener('click', function() {
            linkedEl?.click();
        });
    });
}

function getCheckboxDependency(dependentCheckbox: HTMLInputElement): CheckboxDependency | null {
    const dependency = dependentCheckbox.dataset['depends'] ?? '';
    const separatorIndex = dependency.indexOf(':');
    if (separatorIndex < 1) {
        console.error(`Invalid checkbox data-depends value: "${dependency}". Expected "id:checked" or "id:unchecked".`);
        return null;
    }

    const dependencyId = dependency.slice(0, separatorIndex).trim();
    const expectedValue = dependency.slice(separatorIndex + 1).trim();
    if (!dependencyId || (expectedValue !== 'checked' && expectedValue !== 'unchecked')) {
        console.error(`Invalid checkbox data-depends value: "${dependency}". Expected "id:checked" or "id:unchecked".`);
        return null;
    }

    const source = document.getElementById(dependencyId);
    if (!(source instanceof HTMLInputElement) || source.type !== 'checkbox') {
        console.error(`Checkbox dependency "${dependencyId}" does not reference a checkbox element.`);
        return null;
    }

    return { source, expectedValue };
}

interface CheckboxDependency {
    source: HTMLInputElement;
    expectedValue: 'checked' | 'unchecked';
}

interface CheckboxDependencyListener extends CheckboxDependency {
    handler: () => void;
}

export class ColorPicker {
    public container: HTMLDivElement;
    public previewBox: HTMLDivElement;
    public svCanvas: HTMLCanvasElement;
    public hueSlider: HTMLInputElement;
    public inputElement: HTMLInputElement;
    public hexLabel: HTMLLabelElement;

    private svCtx: CanvasRenderingContext2D | null;
    private currentHex: string;
    private currentH: number;
    private currentS: number;
    private currentV: number;

    constructor(initialValue?: string | number) {
        this.currentHex = typeof initialValue === "string" && /^#[\da-f]{6}$/i.test(initialValue)
        ? initialValue
        : "#000000";

        const hsv = this.hexToHsv(this.currentHex);
        this.currentH = hsv.h;
        this.currentS = hsv.s;
        this.currentV = hsv.v;

        this.container = document.createElement("div");
        this.container.className = "playpen-color-picker";

        this.previewBox = document.createElement("div");
        this.previewBox.className = "color-preview";
        this.previewBox.style.backgroundColor = this.currentHex;

        this.svCanvas = document.createElement("canvas");
        this.svCanvas.className = "sv-canvas";
        this.svCtx = this.svCanvas.getContext("2d", { willReadFrequently: true });

        this.hueSlider = document.createElement("input");
        this.hueSlider.type = "range";
        this.hueSlider.min = "0";
        this.hueSlider.max = "360";
        this.hueSlider.value = String(this.currentH);
        this.hueSlider.className = "hue-slider";

        this.inputElement = document.createElement("input");
        this.inputElement.type = "text";
        this.inputElement.className = "playpen-input color-hex";
        this.inputElement.placeholder = "#RRGGBB";
        this.inputElement.setAttribute("aria-label", "Hex color value");
        this.inputElement.required = true;
        this.inputElement.pattern = "#[\\da-fA-F]{6}";
        this.inputElement.value = this.currentHex;

        this.hexLabel = document.createElement("label");
        this.hexLabel.className = "playpen-label color-hex-label";
        this.hexLabel.textContent = "Hex value";
        this.hexLabel.append(this.inputElement);

        this.container.append(this.previewBox, this.svCanvas, this.hueSlider);
        this.initEvents();
    }

    public mount(parent: HTMLElement): void {
        parent.append(this.container, this.hexLabel);
        this.renderCanvas();
    }

    private renderCanvas(): void {
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = this.svCanvas.clientWidth || 280;
        const displayHeight = 140;

        this.svCanvas.width = displayWidth * dpr;
        this.svCanvas.height = displayHeight * dpr;
        this.svCtx?.scale(dpr, dpr);
        this.drawSVBox(displayWidth, displayHeight);
    }

    private drawSVBox(width: number, height: number): void {
        if (!this.svCtx) return;
        this.svCtx.clearRect(0, 0, width, height);
        this.svCtx.fillStyle = `hsl(${this.currentH}, 100%, 50%)`;
        this.svCtx.fillRect(0, 0, width, height);

        const gradWhite = this.svCtx.createLinearGradient(0, 0, width, 0);
        gradWhite.addColorStop(0, "rgba(255,255,255,1)");
        gradWhite.addColorStop(1, "rgba(255,255,255,0)");
        this.svCtx.fillStyle = gradWhite;
        this.svCtx.fillRect(0, 0, width, height);

        const gradBlack = this.svCtx.createLinearGradient(0, 0, 0, height);
        gradBlack.addColorStop(0, "rgba(0,0,0,0)");
        gradBlack.addColorStop(1, "rgba(0,0,0,1)");
        this.svCtx.fillStyle = gradBlack;
        this.svCtx.fillRect(0, 0, width, height);

        const cx = (this.currentS / 100) * width;
        const cy = (1 - this.currentV / 100) * height;

        this.svCtx.strokeStyle = this.currentV > 50 && this.currentS < 50 ? "#000000" : "#ffffff";
        this.svCtx.lineWidth = 2;
        this.svCtx.beginPath();
        this.svCtx.arc(cx, cy, 5, 0, 2 * Math.PI);
        this.svCtx.stroke();
    }

    private initEvents(): void {
        const updateFromHSV = (h: number, s: number, v: number, updateInput = true) => {
            this.currentHex = this.hsvToHex(h, s, v);
            if (updateInput) this.inputElement.value = this.currentHex;
            this.previewBox.style.backgroundColor = this.currentHex;
            this.drawSVBox(this.svCanvas.clientWidth || 280, 140);
        };

        const handleSVInteraction = (e: MouseEvent | TouchEvent) => {
            const rect = this.svCanvas.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;

            let x = Math.max(0, Math.min(clientX ? clientX - rect.left : 0, rect.width));
            let y = Math.max(0, Math.min(clientY ? clientY - rect.top : 0, rect.height));

            this.currentS = (x / rect.width) * 100;
            this.currentV = (1 - y / rect.height) * 100;
            updateFromHSV(this.currentH, this.currentS, this.currentV);
        };

        this.svCanvas.addEventListener("pointerdown", (e) => {
            this.svCanvas.setPointerCapture(e.pointerId);
            handleSVInteraction(e);
        });

        this.svCanvas.addEventListener("pointermove", (e) => {
            if (e.buttons > 0 || e.pressure > 0) handleSVInteraction(e);
        });

        this.hueSlider.addEventListener("input", () => {
            this.currentH = parseFloat(this.hueSlider.value);
            updateFromHSV(this.currentH, this.currentS, this.currentV);
        });

        this.inputElement.addEventListener("input", () => {
            const isValidHex = /^#[\da-f]{6}$/i.test(this.inputElement.value);
            this.inputElement.setCustomValidity(isValidHex ? "" : "Enter a color in #RRGGBB format.");
            if (isValidHex) {
                this.currentHex = this.inputElement.value;
                const hsv = this.hexToHsv(this.currentHex);
                this.currentH = hsv.h;
                this.currentS = hsv.s;
                this.currentV = hsv.v;
                this.hueSlider.value = String(this.currentH);
                this.previewBox.style.backgroundColor = this.currentHex;
                this.drawSVBox(this.svCanvas.clientWidth || 280, 140);
            }
        });
    }

    private hexToHsv(hex: string) {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, v = max, d = max - min;
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

    private hsvToHex(h: number, s: number, v: number): string {
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
}

export class PopupPlacer {
    private static popupMargin = 5;
    private static cursorX: number | null = null;
    private static cursorY: number | null = null;

    public static init() {
        document.addEventListener("mousemove", (event) => {
            this.cursorX = event.clientX;
            this.cursorY = event.clientY;
        });
    }

    public static place(container: HTMLDivElement, popup: HTMLDivElement, anchor: HTMLElement | null): void {
        popup.style.position = "fixed";
        popup.style.left = "0px";
        popup.style.top = "0px";

        const style = getComputedStyle(popup);
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        const minX = this.popupMargin;
        const minY = this.popupMargin;
        const maxX = window.innerWidth - width - this.popupMargin;
        const maxY = window.innerHeight - height - this.popupMargin;

        if (![width, height, maxX, maxY].every(Number.isFinite) || maxX < minX || maxY < minY) {
            this.fallback(container, popup);
            return;
        }

        const triggerRect = anchor?.getBoundingClientRect();
        const triggerX = triggerRect ? triggerRect.left + triggerRect.width / 2 : this.cursorX;
        const triggerY = triggerRect?.bottom ?? this.cursorY;

        if (triggerX === null || triggerY === null) {
            this.fallback(container, popup);
            return;
        }

        const x = triggerX - width / 2;
        const y = triggerY + this.popupMargin;

        const clampX = (val: number) => Math.max(minX, Math.min(val, maxX));
        const clampY = (val: number) => Math.max(minY, Math.min(val, maxY));

        const aboveTrigger = triggerRect
        ? { x: triggerX - width / 2, y: triggerRect.top - height - this.popupMargin }
        : null;

        const candidates = [
            { x, y },
            ...(aboveTrigger ? [aboveTrigger] : []),
            ...(triggerRect ? [
                { x: triggerRect.right + this.popupMargin, y: triggerRect.top + (triggerRect.height - height) / 2 },
                { x: triggerRect.left - width - this.popupMargin, y: triggerRect.top + (triggerRect.height - height) / 2 }
            ] : [])
        ];

        const fallbackPos = triggerRect && triggerRect.top > window.innerHeight / 2 && aboveTrigger
        ? aboveTrigger
        : { x, y };

        const placement = candidates.find(pos => pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) ?? {
            x: clampX(fallbackPos.x),
            y: clampY(fallbackPos.y)
        };

        popup.style.left = `${placement.x}px`;
        popup.style.top = `${placement.y}px`;
    }

    private static fallback(container: HTMLDivElement, popup: HTMLDivElement) {
        container.classList.add("center", "popup-container-shaded");
        popup.style.position = "";
        popup.style.left = "";
        popup.style.top = "";
    }
}