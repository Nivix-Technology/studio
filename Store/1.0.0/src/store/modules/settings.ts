import { electroview, restart } from './index';
import { init as initNxLib } from './nxlib';
import { showNotification, showPopup } from './notifications';

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }

let isInitialized = false;

const defaultPreferences: Record<string, any> = {
    spaceFillersEnabled: true,
    updateSpaceFillersOnTabChange: true,
    useSpaceFillerBlur: true,
    transitionAnimations: true,
    loadMenuDelay: 750,
    spaceFillerAnimations: true,
    enableDarkThemeSupport: false,
    themeVariables: {},
    themeProfileId: ''
};

type ThemeVariable = {
    name: string;
    property: string;
    description: string;
    section: string;
    type: 'color' | 'range' | 'opacity' | 'select';
    defaultValue: string | number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    options?: string[];
};

type ThemeProfile = {
    format: 'nivix-store-theme';
    version: 1;
    name: string;
    variables: Record<string, string | number>;
};

type SavedThemeProfile = ThemeProfile & { id: string };

type ThemeSaveFileHandle = {
    createWritable(): Promise<{
        write(data: string): Promise<void>;
        close(): Promise<void>;
    }>;
};

type ThemeSaveFilePicker = (options: {
    suggestedName: string;
    types: Array<{
        description: string;
        accept: Record<string, string[]>;
    }>;
}) => Promise<ThemeSaveFileHandle>;

const themeVariables: ThemeVariable[] = [
    { name: 'Accent Color', property: '--brand-primary', section: 'Colors', description: 'The main accent color used for primary buttons and highlights.', type: 'color', defaultValue: '#43a4eb' },
    { name: 'Primary Text', property: '--text-primary', section: 'Colors', description: 'The main text color used throughout the app.', type: 'color', defaultValue: '#313131' },
    { name: 'Light Text', property: '--text-tertiary', section: 'Colors', description: 'Text shown on colored or dark backgrounds.', type: 'color', defaultValue: '#ffffff' },
    { name: 'Primary Background', property: '--background-base', section: 'Colors', description: 'The main app background color.', type: 'color', defaultValue: '#f6f6f6' },
    { name: 'Background Color Contrast', property: '--background-color-step-amount', section: 'Colors', description: 'How much darker backgrounds are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 50, unit: '%' },
    { name: 'Accent Color Contrast', property: '--brand-color-step-amount', section: 'Colors', description: 'How much darker accent colored elements are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 50, unit: '%' },
    { name: 'Corner Radius', property: '--radius', section: 'Shape & spacing', description: 'How round corners are on things like buttons and menus.', type: 'range', defaultValue: 4, min: 0, max: 24, unit: 'px' },
    { name: 'Resting Area Padding', property: '--resting-area-padding', section: 'Shape & spacing', description: 'How much space there is around the inside of panels and other menus.', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },
    { name: 'Clickable Area Vertical Padding', property: '--clickable-area-padding-y', section: 'Shape & spacing', description: 'How much space there is between the text and the top and bottom of buttons and other clickable elements.', type: 'range', defaultValue: 0.4, min: 0, max: 2, step: 0.04, unit: 'rem' },
    { name: 'Clickable Area Horizontal Padding', property: '--clickable-area-padding-x', section: 'Shape & spacing', description: 'How much space there is between the text and the left and right of buttons and other clickable elements.', type: 'range', defaultValue: 1, min: 0, max: 3, step: 0.05, unit: 'rem' },
    { name: 'Element Gap', property: '--gap', section: 'Shape & spacing', description: 'The space between elements in lists, both left-right and top-bottom', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },
    { name: 'Transition Speed', property: '--transition-speed', section: 'Effects & motion', description: 'How long transition animations like fading and switching tabs takes.', type: 'range', defaultValue: 0.2, min: 0.2, max: 10, step: 0.05, unit: 's' },
    { name: 'Transition Easing', property: '--transition-easing-style', section: 'Effects & motion', description: 'Linear: Animation is the same speed until the end. (fastest)\nEase In: Animation starts slow and ends fast.\nEase Out: Animation starts fast and ends slow (deafult)\nEase In Out: Starts slow, middle is fast, ends slow. (most noticable)', type: 'select', defaultValue: 'ease-out', options: ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] }
];

const themeDirectory = 'ThemeProfiles';
const themeFormat = 'nivix-store-theme';

let currentPreferences: Record<string, any> = { ...defaultPreferences };
export let preferences: Readonly<Record<string, any>> = Object.freeze({ ...currentPreferences });
let preferenceWrite: Promise<void> = Promise.resolve();
let settingsInputsInitialized = false;
let savedThemeProfiles: SavedThemeProfile[] = [];

export async function init() {
    const savedPreferences = await electroview.rpc?.request.getPreferences();
    if (Object.keys(savedPreferences).length > 0) {
        currentPreferences = { ...currentPreferences, ...savedPreferences };
        preferences = Object.freeze({ ...currentPreferences });
    }
    
    initSettingsInputs();
    applySettings();
    initNxLib();
    initTab();
    void initThemeEditor().catch(error => {
        console.error('Failed to initialize the theme editor:', error);
        showNotification('Failed to load theme profiles.', 'error');
    });
}

function initSettingsInputs() {
    document.querySelectorAll<HTMLInputElement>('input').forEach(input => {
        if (!input.hasAttribute('data-preferences-key')) return;
        
        const key = input.getAttribute('data-preferences-key')!;
        setPreferenceInput(key, input);
        
        if (settingsInputsInitialized) return;
        input.addEventListener('change', () => {
            let value: any;
            
            if (input.type === 'checkbox') {
                value = Boolean(input.checked);
            } else if (input.type === 'number') {
                value = input.valueAsNumber;
                if (Number.isNaN(value)) {
                    value = currentPreferences[key];
                }
            } else {
                value = input.value;
            }
            
            void setPreference(key, value).catch(error => {
                console.error(`Failed to save preference ${key}:`, error);
            });
            initSettingsInputs();
        });
    });
    
    settingsInputsInitialized = true;
}

function setPreferenceInput(key: string, input: HTMLInputElement) {
    if (!(key in currentPreferences)) {
        console.error(`Unknown settings key on input: ${key}`);
        return;
    }
    
    if (input.type === 'checkbox') {
        if (typeof currentPreferences[key] !== 'boolean') {
            console.error(`Setting ${key} must be a boolean for a checkbox input.`);
            return;
        }
        input.checked = currentPreferences[key];
    } else if (input.type === 'number') {
        input.valueAsNumber = Number(currentPreferences[key]);
    } else {
        input.value = currentPreferences[key];
    }
}

async function setPreference(key: string, value: any) {
    await setPreferences({ [key]: value });
}

async function setPreferences(updates: Record<string, any>) {
    for (const [key, value] of Object.entries(updates)) {
        if (!(key in currentPreferences)) {
            const errorMsg = `Unknown key: ${key}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        if (typeof value !== typeof currentPreferences[key]) {
            const errorMsg = `The new value for ${key} is not the same type as the existing value: ${typeof currentPreferences[key]}. Type of attempted value is ${typeof value}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    currentPreferences = { ...currentPreferences, ...updates };
    preferences = Object.freeze({ ...currentPreferences });
    applySettings();
    for (const key of Object.keys(updates)) notifyPreferencesUpdate(key);
    const snapshot = { ...currentPreferences };
    const write = preferenceWrite.then(async () => {
        const preferencesSaved = await electroview.rpc?.request.setPreferences(snapshot);
        if (preferencesSaved !== true) throw new Error(`Failed to save preferences: ${Object.keys(updates).join(', ')}.`);
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
}

function applySettings() {
    const rootStyle = document.documentElement.style;
    const overrides = readThemeVariables(preferences['themeVariables']);
    
    for (const variable of themeVariables) {
        const value = overrides[variable.property];
        if (value === undefined) rootStyle.removeProperty(variable.property);
        else rootStyle.setProperty(variable.property, themeCssValue(variable, value));
    }
    
    if (!preferences['transitionAnimations']) {
        rootStyle.setProperty('--transition-speed', '0s');
    }
    
    if (!preferences['transitionAnimations']) {
        rootStyle.setProperty('--transition-speed', '0s');
    }
    
    if (preferences['enableDarkThemeSupport']) {
        const darkerVal = overrides['--background-stack'] || 
        themeVariables.find(v => v.property === '--background-stack')?.defaultValue || 
        getComputedStyle(document.documentElement).getPropertyValue('--background-stack').trim() ||
        'color-mix(in srgb, var(--background-base), black var(--background-color-step-amount, 12%))';
        
        const lighterVal = overrides['--background-stack-inverse'] || 
        themeVariables.find(v => v.property === '--background-stack-inverse')?.defaultValue || 
        getComputedStyle(document.documentElement).getPropertyValue('--background-stack-inverse').trim() ||
        'color-mix(in srgb, var(--background-base), white var(--background-color-step-amount, 12%))';
        
        if (lighterVal) rootStyle.setProperty('--background-stack', String(lighterVal));
        if (darkerVal) rootStyle.setProperty('--background-stack-inverse', String(darkerVal));
    } else {
        rootStyle.removeProperty('--background-stack');
        rootStyle.removeProperty('--background-stack-inverse');
    }
}

function readThemeVariables(value: unknown): Record<string, string | number> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const overrides: Record<string, string | number> = {};
    for (const variable of themeVariables) {
        const candidate = (value as Record<string, unknown>)[variable.property];
        if (isValidThemeValue(variable, candidate)) overrides[variable.property] = candidate;
    }
    return overrides;
}

function isValidThemeValue(variable: ThemeVariable, value: unknown): value is string | number {
    if (variable.type === 'color') {
        return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    }
    if (variable.type === 'select') {
        return typeof value === 'string' && variable.options!.includes(value);
    }
    return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= variable.min! &&
    value <= variable.max!;
}

function themeCssValue(variable: ThemeVariable, value: string | number): string {
    if (variable.type === 'opacity') return `rgba(0, 0, 0, ${value})`;
    return variable.type === 'range' ? `${value}${variable.unit}` : String(value);
}

async function initThemeEditor() {
    const storedVariables = readThemeVariables(preferences['themeVariables']);
    buildThemeInputs(storedVariables);
    
    getEBD<HTMLSelectElement>('settings-theme-profile').addEventListener('change', () => {
        void selectThemeProfile().catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-save-profile').addEventListener('click', () => {
        void saveThemeProfile().catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-import').addEventListener('click', () => {
        getEBD<HTMLInputElement>('settings-theme-import-file').click();
    });
    getEBD<HTMLInputElement>('settings-theme-import-file').addEventListener('change', event => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) void importThemeProfile(file).catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-export').addEventListener('click', () => {
        void exportThemeProfile().catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-delete').addEventListener('click', () => {
        void deleteThemeProfile().catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-reset').addEventListener('click', () => {
        void resetTheme().catch(showThemeError);
    });
    
    updateThemeProfileButtons();
    const result = await manageThemeFile('createDirectory', themeDirectory);
    if (result !== true) throw new Error('Could not create the theme profile directory.');
    await refreshThemeProfiles(String(preferences['themeProfileId'] ?? ''));
}

function buildThemeInputs(overrides: Record<string, string | number>) {
    const container = getEBD<HTMLDivElement>('settings-theme-variables');
    container.replaceChildren();
    let section = '';
    let sectionContainer: HTMLDivElement | null = null;
    for (const variable of themeVariables) {
        if (variable.section !== section) {
            section = variable.section;
            const group = document.createElement('section');
            group.className = 'theme-variable-group';
            const label = document.createElement('span');
            label.classList.add('nivix-label');
            label.textContent = section;
            const divider = document.createElement('hr');
            group.append(label);
            group.append(divider);
            sectionContainer = document.createElement('div');
            sectionContainer.className = 'theme-variable-list';
            group.append(sectionContainer);
            container.append(group);
        }
        
        const row = document.createElement('div');
        row.className = 'theme-variable';
        const inputId = `theme-variable-${variable.property.slice(2)}`;
        const value = overrides[variable.property] ?? variable.defaultValue;
        let input: HTMLInputElement | HTMLSelectElement;
        if (variable.type === 'select') {
            const select = document.createElement('select');
            select.className = 'nivix-select';
            for (const option of variable.options!) select.add(new Option(option, option));
            input = select;
        } else {
            const field = document.createElement('input');
            field.type = variable.type === 'color' ? 'color' : 'range';
            input = field;
        }
        input.id = inputId;
        if (!input.classList) input.className = 'nivix-input';
        input.value = String(value);
        if (input instanceof HTMLInputElement && (variable.type === 'range' || variable.type === 'opacity')) {
            input.min = String(variable.min);
            input.max = String(variable.max);
            input.step = String(variable.step ?? 1);
        }
        const label = document.createElement('label');
        label.htmlFor = inputId;
        label.textContent = variable.name;
        const help = document.createElement('button');
        help.type = 'button';
        help.className = 'tooltip-button tip-right';
        help.textContent = 'i';
        help.setAttribute('aria-label', `About ${variable.name}`);
        help.setAttribute('data-tooltip-content', variable.description);
        const control = document.createElement('div');
        control.className = 'theme-variable-control';
        const valueLabel = document.createElement('span');
        valueLabel.className = 'theme-variable-value';
        const displayValue = (nextValue: string | number) => {
            if (variable.type === 'color' || variable.type === 'select') return String(nextValue);
            if (variable.type === 'opacity') return `${Math.round(Number(nextValue) * 100)}%`;
            return `${nextValue}${variable.unit}`;
        };
        valueLabel.textContent = displayValue(value);
        control.append(input, valueLabel);
        row.append(label, help, control);
        
        const applyInputValue = () => {
            const nextValue = variable.type === 'range' || variable.type === 'opacity'
            ? (input as HTMLInputElement).valueAsNumber
            : input.value;
            valueLabel.textContent = displayValue(nextValue);
            document.documentElement.style.setProperty(variable.property, themeCssValue(variable, nextValue));
        };
        input.addEventListener('input', applyInputValue);
        input.addEventListener('change', () => {
            const nextValue = variable.type === 'range' || variable.type === 'opacity'
            ? (input as HTMLInputElement).valueAsNumber
            : input.value;
            void updateThemeVariable(variable, nextValue).catch(showThemeError);
        });
        sectionContainer!.append(row);
    }
}

function showThemeError(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('Theme editor action failed:', error);
    showNotification('The theme change could not be completed.', 'error');
}

async function manageThemeFile(
    operation: 'read' | 'write' | 'list' | 'createDirectory' | 'delete',
    path: string,
    content?: string
): Promise<string | string[] | boolean | null> {
    const request = electroview.rpc?.request.manageStoreFile;
    if (!request) throw new Error('The theme profile storage service is unavailable.');
    return await request({ operation, path, content });
}

function themeProfilePath(id: string): string {
    if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('The theme profile identifier is invalid.');
    return `${themeDirectory}/${id}.storetheme`;
}

function parseThemeProfile(content: string): ThemeProfile {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('The theme file must contain a JSON object.');
    }
    const record = parsed as Record<string, unknown>;
    if (record['format'] !== themeFormat || record['version'] !== 1 ||
        typeof record['name'] !== 'string' || !record['name'].trim() ||
        record['name'].length > 64) {
            throw new Error('The theme file format or profile name is invalid.');
        }
        const variables = readThemeVariables(record['variables']);
        if (typeof record['variables'] !== 'object' || record['variables'] === null ||
            Array.isArray(record['variables'])) {
                throw new Error('The theme file contains invalid CSS variable values.');
            }
            for (const [property, value] of Object.entries(record['variables'])) {
                const variable = themeVariables.find(item => item.property === property);
                if (variable && !isValidThemeValue(variable, value)) {
                    throw new Error(`The theme file contains an invalid value for ${property}.`);
                }
            }
            return {
                format: themeFormat,
                version: 1,
                name: record['name'].trim(),
                variables
            };
        }
        
        async function refreshThemeProfiles(selectedId = '') {
            const result = await manageThemeFile('list', themeDirectory);
            if (!Array.isArray(result)) throw new Error('Could not list theme profiles.');
            const ids = result
            .filter(file => file.toLocaleLowerCase('en-US').endsWith('.storetheme'))
            .map(file => file.slice(0, -'.storetheme'.length))
            .filter(id => /^[\da-f-]{36}$/i.test(id));
            const profiles: SavedThemeProfile[] = [];
            for (const id of ids) {
                const content = await manageThemeFile('read', themeProfilePath(id));
                if (typeof content !== 'string') throw new Error(`Theme profile ${id} could not be read.`);
                profiles.push({ ...parseThemeProfile(content), id });
            }
            savedThemeProfiles = profiles;
            
            const select = getEBD<HTMLSelectElement>('settings-theme-profile');
            select.replaceChildren(new Option('Current theme', ''));
            for (const profile of profiles) select.add(new Option(profile.name, profile.id));
            select.value = profiles.some(profile => profile.id === selectedId) ? selectedId : '';
            updateThemeProfileButtons();
        }
        
        function updateThemeProfileButtons() {
            const hasSelectedProfile = Boolean(getEBD<HTMLSelectElement>('settings-theme-profile').value);
            getEBD<HTMLButtonElement>('settings-theme-export').disabled = !hasSelectedProfile;
            getEBD<HTMLButtonElement>('settings-theme-delete').disabled = !hasSelectedProfile;
        }
        
        async function selectThemeProfile() {
            const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
            updateThemeProfileButtons();
            if (!id) {
                await setPreferences({ themeProfileId: '' });
                return;
            }
            const content = await manageThemeFile('read', themeProfilePath(id));
            if (typeof content !== 'string') throw new Error('The selected theme profile could not be read.');
            const profile = parseThemeProfile(content);
            await setPreferences({ themeVariables: profile.variables, themeProfileId: id });
            buildThemeInputs(profile.variables);
        }
        
        async function updateThemeVariable(variable: ThemeVariable, value: string | number) {
            if (!isValidThemeValue(variable, value)) throw new Error(`Invalid value for ${variable.name}.`);
            const variables = readThemeVariables(preferences['themeVariables']);
            if (value === variable.defaultValue) delete variables[variable.property];
            else variables[variable.property] = value;
            
            const profileId = String(preferences['themeProfileId'] ?? '');
            await setPreferences({ themeVariables: variables });
            if (profileId) {
                const profile = savedThemeProfiles.find(item => item.id === profileId);
                if (!profile) throw new Error('The active theme profile could not be found.');
                const updatedProfile: ThemeProfile = { ...profile, variables };
                const result = await manageThemeFile('write', themeProfilePath(profileId), JSON.stringify(updatedProfile, null, 2));
                if (result !== true) throw new Error('The active theme profile could not be updated.');
                profile.variables = variables;
            }
        }
        
        async function saveThemeProfile() {
            const nameInput = getEBD<HTMLInputElement>('settings-theme-profile-name');
            const name = nameInput.value.trim();
            if (!name) {
                showNotification('Enter a name for the theme profile.', 'warning');
                nameInput.focus();
                return;
            }
            const id = crypto.randomUUID();
            const profile: ThemeProfile = {
                format: themeFormat,
                version: 1,
                name,
                variables: readThemeVariables(preferences['themeVariables'])
            };
            const result = await manageThemeFile('write', themeProfilePath(id), JSON.stringify(profile, null, 2));
            if (result !== true) throw new Error('The theme profile could not be saved.');
            await setPreferences({ themeProfileId: id });
            nameInput.value = '';
            await refreshThemeProfiles(id);
            showNotification(`Theme profile "${name}" saved.`);
        }
        
        async function importThemeProfile(file: File) {
            if (!file.name.toLocaleLowerCase('en-US').endsWith('.storetheme')) {
                throw new Error('Choose a .storetheme file.');
            }
            const profile = parseThemeProfile(await file.text());
            const id = crypto.randomUUID();
            const result = await manageThemeFile('write', themeProfilePath(id), JSON.stringify(profile, null, 2));
            if (result !== true) throw new Error('The imported theme profile could not be saved.');
            await refreshThemeProfiles(id);
            await setPreferences({ themeVariables: profile.variables, themeProfileId: id });
            buildThemeInputs(profile.variables);
            showNotification(`Theme profile "${profile.name}" imported.`);
        }
        
        async function exportThemeProfile() {
            const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
            const profile = savedThemeProfiles.find(item => item.id === id);
            if (!profile) throw new Error('Select a saved theme profile to export.');
            const content = JSON.stringify({
                format: themeFormat,
                version: 1,
                name: profile.name,
                variables: profile.variables
            }, null, 2);
            const picker = (window as Window & { showSaveFilePicker?: ThemeSaveFilePicker }).showSaveFilePicker;
            if (!picker) throw new Error('Save-file dialogs are not available in this app environment.');
            
            const file = await picker.call(window, {
                suggestedName: `${profile.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.storetheme`,
                types: [{
                    description: 'Nivix Store theme',
                    accept: { 'application/json': ['.storetheme'] }
                }]
            });
            const writable = await file.createWritable();
            await writable.write(content);
            await writable.close();
            showNotification(`Theme profile "${profile.name}" exported.`);
        }
        
        async function deleteThemeProfile() {
            const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
            const profile = savedThemeProfiles.find(item => item.id === id);
            if (!profile) return;
            if (!await confirmReset('Delete Theme Profile', `Delete the "${profile.name}" theme profile? This cannot be undone.`)) return;
            const result = await manageThemeFile('delete', themeProfilePath(id));
            if (result !== true) throw new Error('The theme profile could not be deleted.');
            if (preferences['themeProfileId'] === id) {
                await setPreferences({ themeVariables: {}, themeProfileId: '' });
                buildThemeInputs({});
            }
            await refreshThemeProfiles();
            showNotification(`Theme profile "${profile.name}" deleted.`);
        }
        
        async function resetTheme() {
            if (!await confirmReset('Reset Theme', 'Clear the current theme preferences and restore the default CSS values? Saved profiles will not be deleted.')) return;
            await setPreferences({ themeVariables: {}, themeProfileId: '' });
            buildThemeInputs({});
            await refreshThemeProfiles();
            showNotification('Theme preferences have been reset.');
        }
        
        async function resetPreferences() {
            const snapshot = { ...defaultPreferences };
            const write = preferenceWrite.then(async () => {
                const preferencesSaved = await electroview.rpc?.request.setPreferences(snapshot);
                if (preferencesSaved !== true) throw new Error('Failed to reset preferences.');
                currentPreferences = snapshot;
                preferences = Object.freeze({ ...currentPreferences });
                applySettings();
                for (const key of Object.keys(defaultPreferences)) {
                    notifyPreferencesUpdate(key);
                }
                document.querySelectorAll<HTMLInputElement>('input[data-preferences-key]').forEach(input => {
                    const key = input.getAttribute('data-preferences-key')!;
                    const value = currentPreferences[key];
                    if (input.type === 'checkbox') input.checked = value;
                    else if (input.type === 'number') input.valueAsNumber = Number(value);
                    else input.value = String(value);
                });
            });
            preferenceWrite = write.catch(() => undefined);
            await write;
            buildThemeInputs({});
            getEBD<HTMLSelectElement>('settings-theme-profile').value = '';
            updateThemeProfileButtons();
            initNxLib();
        }
        
        function notifyPreferencesUpdate(preference: string) {
            window.dispatchEvent(new CustomEvent('preferencesUpdate', {
                detail: { preference }
            }));
        }
        
        // Tab Functionality
        
        const restartBtn = getEBD<HTMLButtonElement>('settings-restart');
        const resetAppDataBtn = getEBD<HTMLButtonElement>('settings-reset-appData');
        const resetInventoryBtn = getEBD<HTMLButtonElement>('settings-reset-resetInventory');
        const resetPreferencesBtn = getEBD<HTMLButtonElement>('settings-reset-preferences');
        
        async function confirmReset(title: string, message: string): Promise<boolean> {
            return await showPopup<boolean>(title, message, 'options', [
                { content: 'Cancel', value: false, highlighted: true },
                { content: 'Reset', value: true }
            ]) === true;
        }
        
        async function resetInventory() {
            if (!await confirmReset(
                'Reset Inventory',
                'This permanently deletes all spaces, categories, and items from the currently connected database. This cannot be undone.'
            )) return;
            
            try {
                if (!electroview.rpc?.request.resetInventory) {
                    throw new Error('The inventory reset service is unavailable.');
                }
                await electroview.rpc.request.resetInventory();
                showNotification('The connected database inventory has been reset.');
            } catch (error) {
                console.error('Failed to reset the connected database inventory:', error);
                showNotification('Failed to reset the connected database inventory.', 'error');
            }
        }
        
        async function resetAllAppData() {
            if (!await confirmReset(
                'Reset App Data',
                'This permanently deletes all data stored by this app on this device, including preferences, local inventory, and user files. The app will return to its default local database.'
            )) return;
            
            try {
                if (!electroview.rpc?.request.resetAppData) {
                    throw new Error('The app-data reset service is unavailable.');
                }
                await electroview.rpc.request.resetAppData();
                window.location.reload();
            } catch (error) {
                console.error('Failed to reset application data:', error);
                showNotification('Failed to reset application data.', 'error');
            }
        }
        
        function initTab() {
            if (isInitialized) return;
            
            restartBtn.addEventListener('click', restart);
            resetAppDataBtn.addEventListener('click', () => void resetAllAppData());
            resetInventoryBtn.addEventListener('click', () => void resetInventory());
            resetPreferencesBtn.addEventListener('click', () => {
                void (async () => {
                    try {
                        if (!await confirmReset(
                            'Reset Preferences',
                            'This restores all preferences to their default values.'
                        )) return;
                        await resetPreferences();
                        showNotification('Preferences have been reset.');
                    } catch (error) {
                        console.error('Failed to reset preferences:', error);
                        showNotification('Failed to reset preferences.', 'error');
                    }
                })();
            });
            
            isInitialized = true;
        }