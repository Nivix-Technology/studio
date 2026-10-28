import { electroview } from './index';
import { init as initPlaypenLib } from './playpen';
import { showNotification, showPopup } from './notifications';

type PreferenceValues = {
    spaceFillersEnabled: boolean;
    updateSpaceFillersOnTabChange: boolean;
    useSpaceFillerBlur: boolean;
    transitionAnimations: boolean;
    loadMenuDelay: number;
    spaceFillerAnimations: boolean;
    enableDarkThemeSupport: boolean;
    themeVariables: Record<string, any>;
    themeProfileId: string;
    [key: string]: unknown;
};

type ThemeValue = string | number;

type ThemeVariable = {
    name: string;
    property: string;
    description: string;
    section: string;
    type: 'color' | 'range' | 'select';
    defaultValue: ThemeValue;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    options?: string[];
};

type ThemeProfile = {
    format: 'playpen-store-theme';
    version: 1;
    name: string;
    variables: Record<string, ThemeValue>;
};

type SavedThemeProfile = ThemeProfile & { id: string };
type ThemeSaveFilePicker = (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;

const defaultPreferences: PreferenceValues = {
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

const themeVariables: ThemeVariable[] = [
    { name: 'Accent Color', property: '--brand-primary', section: 'Colors', description: 'The main accent color used for primary buttons and highlights.', type: 'color', defaultValue: '#43a4eb' },

    { name: 'Accent Color Contrast', property: '--brand-color-step-amount', section: 'Colors', description: 'How much darker accent colored elements are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 20, unit: '%' },

    { name: 'Primary Background', property: '--background-base', section: 'Colors', description: 'The main app background color.', type: 'color', defaultValue: '#f6f6f6' },

    { name: 'Background Color Contrast', property: '--background-color-step-amount', section: 'Colors', description: 'How much darker backgrounds are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 20, unit: '%' },

    { name: 'Primary Text', property: '--text-primary', section: 'Colors', description: 'The main text color used throughout the app.', type: 'color', defaultValue: '#313131' },

    { name: 'Light Text', property: '--text-tertiary', section: 'Colors', description: 'Text shown on colored or dark backgrounds.', type: 'color', defaultValue: '#ffffff' },

    { name: 'Corner Radius', property: '--radius', section: 'Shape & spacing', description: 'How round corners are on things like buttons and menus.', type: 'range', defaultValue: 4, min: 0, max: 24, unit: 'px' },
    
    { name: 'Resting Area Padding', property: '--resting-area-padding', section: 'Shape & spacing', description: 'How much space there is around the inside of panels and other menus.', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },

    { name: 'Element Gap', property: '--gap', section: 'Shape & spacing', description: 'The space between elements in lists, both left-right and top-bottom.', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },
    
    { name: 'Clickable Area Vertical Padding', property: '--clickable-area-padding-y', section: 'Shape & spacing', description: 'How much space there is between the text and the top and bottom of buttons and other clickable elements.', type: 'range', defaultValue: 0.4, min: 0, max: 2, step: 0.04, unit: 'rem' },
    
    { name: 'Clickable Area Horizontal Padding', property: '--clickable-area-padding-x', section: 'Shape & spacing', description: 'How much space there is between the text and the left and right of buttons and other clickable elements.', type: 'range', defaultValue: 1, min: 0, max: 3, step: 0.05, unit: 'rem' },
    
    { name: 'Outline Thickness', property: '--outline-width', section: 'Accessibility', description: 'How thick the line around an item is when said item is clicked or focused on with the TAB key.', type: 'range', min: 2, defaultValue: 1.5, max: 10, step: 0.5, unit: 'px' },
    
    { name: 'Outline Color', property: '--outline-color', section: 'Accessibility', description: 'The color of the line around an item is when said item is clicked or focused on with the TAB key.', type: 'color', defaultValue: '#ff6b00' },
    
    { name: 'Transition Speed', property: '--transition-speed', section: 'Effects & motion', description: 'How long transition animations like fading and switching tabs take.', type: 'range', defaultValue: 0.2, min: 0.2, max: 10, step: 0.05, unit: 's' },
    
    { name: 'Transition Easing Style', property: '--transition-easing-style', section: 'Effects & motion', description: '<strong>Linear:</strong> Animation is the same speed until the end.<br><strong>Ease In:</strong> Animation starts slow and ends fast.<br><strong>Ease Out:</strong> Animation starts fast and ends slow.<br><strong>Ease In Out:</strong> Starts slow, middle is fast, ends slow.', type: 'select', defaultValue: 'ease-out', options: ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] }
];

const themeDirectory = 'ThemeProfiles';
const themeFormat = 'playpen-store-theme';
const profileIdPattern = /^[\da-f-]{36}$/i;

let currentPreferences: PreferenceValues = { ...defaultPreferences };
export let preferences: Readonly<PreferenceValues> = Object.freeze({ ...currentPreferences });
let preferenceWrite: Promise<void> = Promise.resolve();
let settingsInputsInitialized = false;
let tabInitialized = false;
let savedThemeProfiles: SavedThemeProfile[] = [];

function getEBD<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Settings element "${id}" was not found.`);
    return element as T;
}

export async function init() {
    const saved = await electroview.rpc?.request.getPreferences();
    if (saved && Object.keys(saved).length) {
        currentPreferences = { ...currentPreferences, ...saved };
        preferences = Object.freeze({ ...currentPreferences });
    }

    initSettingsInputs();
    applySettings();
    initPlaypenLib();
    initTab();
    void initThemeEditor().catch(error => {
        console.error('Failed to initialize the theme editor:', error);
        showNotification('Failed to load theme profiles.', 'error');
    });
}

function initSettingsInputs() {
    if (settingsInputsInitialized) return;
    document.querySelectorAll<HTMLInputElement>('input[data-preferences-key]').forEach(input => {
        const key = input.dataset['preferencesKey']!;
        syncPreferenceInput(input, key);
        input.addEventListener('change', () => {
            let value: unknown = input.type === 'checkbox' ? input.checked :
                input.type === 'number' ? input.valueAsNumber : input.value;
            if (typeof value === 'number' && Number.isNaN(value)) value = currentPreferences[key as keyof PreferenceValues];
            void setPreferences({ [key]: value } as Partial<PreferenceValues>).catch(error => {
                console.error(`Failed to save preference ${key}:`, error);
            });
        });
    });
    settingsInputsInitialized = true;
}

function syncPreferenceInput(input: HTMLInputElement, key: string) {
    const value = currentPreferences[key];
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (input.type === 'number') input.valueAsNumber = Number(value);
    else input.value = String(value);
}

async function setPreferences(updates: Partial<PreferenceValues>) {
    for (const [key, value] of Object.entries(updates)) {
        if (!(key in currentPreferences)) throw new Error(`Unknown preference: ${key}`);
        if (value !== undefined && typeof value !== typeof currentPreferences[key as keyof PreferenceValues]) {
            throw new Error(`Preference "${key}" must be a ${typeof currentPreferences[key as keyof PreferenceValues]}.`);
        }
    }

    currentPreferences = { ...currentPreferences, ...updates };
    preferences = Object.freeze({ ...currentPreferences });
    applySettings();
    Object.keys(updates).forEach(notifyPreferencesUpdate);

    const snapshot = { ...currentPreferences };
    const write = preferenceWrite.then(async () => {
        const saved = await electroview.rpc?.request.setPreferences(snapshot);
        if (saved !== true) throw new Error(`Failed to save preferences: ${Object.keys(updates).join(', ')}.`);
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
}

function applySettings() {
    const style = document.documentElement.style;
    const overrides = readThemeVariables(preferences['themeVariables']);

    for (const variable of themeVariables) {
        const value = overrides[variable.property];
        if (value === undefined) style.removeProperty(variable.property);
        else style.setProperty(variable.property, themeCssValue(variable, value));
    }

    if (!preferences['transitionAnimations']) style.setProperty('--transition-speed', '0s');

    if (preferences['enableDarkThemeSupport']) {
        style.setProperty('--background-stack', 'color-mix(in srgb, transparent, white var(--background-color-step-amount, 12%))');
        style.setProperty('--background-stack-inverse', 'color-mix(in srgb, transparent, black var(--background-color-step-amount, 12%))');
    } else {
        style.removeProperty('--background-stack');
        style.removeProperty('--background-stack-inverse');
    }
}

function readThemeVariables(value: unknown): Record<string, ThemeValue> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return Object.fromEntries(themeVariables.flatMap(variable =>
        isValidThemeValue(variable, record[variable.property])
            ? [[variable.property, record[variable.property] as ThemeValue]]
            : []
    ));
}

function isValidThemeValue(variable: ThemeVariable, value: unknown): value is ThemeValue {
    if (variable.type === 'color') return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    if (variable.type === 'select') return typeof value === 'string' && variable.options!.includes(value);
    return typeof value === 'number' && Number.isFinite(value) &&
        value >= variable.min! && value <= variable.max!;
}

function themeCssValue(variable: ThemeVariable, value: ThemeValue): string {
    return variable.type === 'range' ? `${value}${variable.unit}` : String(value);
}

function notifyPreferencesUpdate(preference: string) {
    window.dispatchEvent(new CustomEvent('preferencesUpdate', { detail: { preference } }));
}

async function manageThemeFile(
    operation: 'read' | 'write' | 'list' | 'createDirectory' | 'delete',
    path: string,
    content?: string
): Promise<string | string[] | boolean | null> {
    const request = electroview.rpc?.request.manageStoreFile;
    if (!request) throw new Error('The theme profile storage service is unavailable.');
    return request({ operation, path, content });
}

function themeProfilePath(id: string) {
    if (!profileIdPattern.test(id)) throw new Error('The theme profile identifier is invalid.');
    return `${themeDirectory}/${id}.storetheme`;
}

function parseThemeProfile(content: string): ThemeProfile {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('The theme file must contain a JSON object.');
    }

    const record = parsed as Record<string, unknown>;
    if (record['format'] !== themeFormat || record['version'] !== 1 ||
        typeof record['name'] !== 'string' || !record['name'].trim() || record['name'].length > 64) {
        throw new Error('The theme file format or profile name is invalid.');
    }
    if (typeof record['variables'] !== 'object' || record['variables'] === null || Array.isArray(record['variables'])) {
        throw new Error('The theme file contains invalid CSS variable values.');
    }

    const rawVariables = record['variables'] as Record<string, unknown>;
    for (const [property, value] of Object.entries(rawVariables)) {
        const variable = themeVariables.find(item => item.property === property);
        if (variable && !isValidThemeValue(variable, value)) {
            throw new Error(`The theme file contains an invalid value for ${property}.`);
        }
    }
    return {
        format: themeFormat,
        version: 1,
        name: record['name'].trim(),
        variables: readThemeVariables(rawVariables)
    };
}

async function initThemeEditor() {
    buildThemeInputs();
    getEBD<HTMLSelectElement>('settings-theme-profile').addEventListener('change', () => {
        void selectThemeProfile().catch(showThemeError);
    });
    getEBD<HTMLButtonElement>('settings-theme-save-profile').addEventListener('click', () => {
        void saveThemeProfile().catch(showThemeError);
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

    updateThemeProfileButtons();
    if (await manageThemeFile('createDirectory', themeDirectory) !== true) {
        throw new Error('Could not create the theme profile directory.');
    }
    await refreshThemeProfiles(String(preferences['themeProfileId'] ?? ''));
}

function buildThemeInputs() {
    const container = getEBD<HTMLDivElement>('settings-theme-variables');
    container.replaceChildren();
    let section = '';
    let sectionContainer: HTMLDivElement;

    for (const variable of themeVariables) {
        if (variable.section !== section) {
            section = variable.section;
            const group = document.createElement('section');
            group.className = 'theme-variable-group';
            const label = document.createElement('span');
            label.className = 'playpen-label';
            label.textContent = section;
            sectionContainer = document.createElement('div');
            sectionContainer.className = 'theme-variable-list';
            group.append(label, document.createElement('hr'), sectionContainer);
            container.append(group);
        }

        const row = document.createElement('button');
        row.className = 'playpen-primary-button';
        row.innerText = variable.name;
        sectionContainer!.append(row);
    }
}

function showThemeError(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('Theme editor action failed:', error);
    showNotification('The theme change could not be completed.', 'error');
}

async function refreshThemeProfiles(selectedId = '') {
    const result = await manageThemeFile('list', themeDirectory);
    if (!Array.isArray(result)) throw new Error('Could not list theme profiles.');
    const ids = result
        .filter(file => file.toLocaleLowerCase('en-US').endsWith('.storetheme'))
        .map(file => file.slice(0, -'.storetheme'.length))
        .filter(id => profileIdPattern.test(id));
    savedThemeProfiles = await Promise.all(ids.map(async id => {
        const content = await manageThemeFile('read', themeProfilePath(id));
        if (typeof content !== 'string') throw new Error(`Theme profile ${id} could not be read.`);
        return { ...parseThemeProfile(content), id };
    }));

    const select = getEBD<HTMLSelectElement>('settings-theme-profile');
    select.replaceChildren(new Option('Current theme', ''));
    savedThemeProfiles.forEach(profile => select.add(new Option(profile.name, profile.id)));
    select.value = savedThemeProfiles.some(profile => profile.id === selectedId) ? selectedId : '';
    updateThemeProfileButtons();
}

function updateThemeProfileButtons() {
    const selected = Boolean(getEBD<HTMLSelectElement>('settings-theme-profile').value);
    getEBD<HTMLButtonElement>('settings-theme-export').disabled = !selected;
    getEBD<HTMLButtonElement>('settings-theme-delete').disabled = !selected;
}

async function selectThemeProfile() {
    const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
    updateThemeProfileButtons();
    if (!id) return setPreferences({ themeProfileId: '' });

    const content = await manageThemeFile('read', themeProfilePath(id));
    if (typeof content !== 'string') throw new Error('The selected theme profile could not be read.');
    const profile = parseThemeProfile(content);
    await setPreferences({ themeVariables: profile.variables, themeProfileId: id });
    buildThemeInputs();
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
    if (await manageThemeFile('write', themeProfilePath(id), JSON.stringify(profile, null, 2)) !== true) {
        throw new Error('The theme profile could not be saved.');
    }
    await setPreferences({ themeProfileId: id });
    nameInput.value = '';
    await refreshThemeProfiles(id);
    showNotification(`Theme profile "${name}" saved.`);
}

async function importThemeProfile(file: File) {
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.storetheme')) throw new Error('Choose a .storetheme file.');
    const profile = parseThemeProfile(await file.text());
    const id = crypto.randomUUID();
    if (await manageThemeFile('write', themeProfilePath(id), JSON.stringify(profile, null, 2)) !== true) {
        throw new Error('The imported theme profile could not be saved.');
    }
    await refreshThemeProfiles(id);
    await setPreferences({ themeVariables: profile.variables, themeProfileId: id });
    buildThemeInputs();
    showNotification(`Theme profile "${profile.name}" imported.`);
}

async function exportThemeProfile() {
    const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
    const profile = savedThemeProfiles.find(item => item.id === id);
    if (!profile) throw new Error('Select a saved theme profile to export.');
    const picker = (window as Window & { showSaveFilePicker?: ThemeSaveFilePicker }).showSaveFilePicker;
    if (!picker) throw new Error('Save-file dialogs are not available in this app environment.');

    const content = JSON.stringify({
        format: themeFormat,
        version: 1,
        name: profile.name,
        variables: profile.variables
    }, null, 2);
    const file = await picker.call(window, {
        suggestedName: `${profile.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.storetheme`,
        types: [{ description: 'Playpen Store theme', accept: { 'application/json': ['.storetheme'] } }]
    });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
    showNotification(`Theme profile "${profile.name}" exported.`);
}

async function confirmReset(title: string, message: string) {
    return await showPopup<boolean>(title, message, 'options', [
        { content: 'Cancel', value: false, highlighted: true },
        { content: 'Reset', value: true }
    ]) === true;
}

async function deleteThemeProfile() {
    const id = getEBD<HTMLSelectElement>('settings-theme-profile').value;
    const profile = savedThemeProfiles.find(item => item.id === id);
    if (!profile || !await confirmReset('Delete Theme Profile', `Delete the "${profile.name}" theme profile? This cannot be undone.`)) return;
    if (await manageThemeFile('delete', themeProfilePath(id)) !== true) {
        throw new Error('The theme profile could not be deleted.');
    }
    if (preferences['themeProfileId'] === id) {
        await setPreferences({ themeVariables: {}, themeProfileId: '' });
        buildThemeInputs();
    }
    await refreshThemeProfiles();
    showNotification(`Theme profile "${profile.name}" deleted.`);
}

async function resetTheme() {
    if (!await confirmReset('Reset Theme', 'Clear the current theme preferences and restore the default CSS values? Saved profiles will not be deleted.')) return;
    await setPreferences({ themeVariables: {}, themeProfileId: '' });
    await setPreferences({ enableDarkThemeSupport: false });
    getEBD<HTMLInputElement>('settings-enableDarkThemeSupport').checked = false;
    buildThemeInputs();
    await refreshThemeProfiles();
    showNotification('Theme preferences have been reset.');
}

async function resetPreferences() {
    const snapshot = { ...defaultPreferences, themeVariables: {} };
    const write = preferenceWrite.then(async () => {
        if (await electroview.rpc?.request.setPreferences(snapshot) !== true) {
            throw new Error('Failed to reset preferences.');
        }
        currentPreferences = snapshot;
        preferences = Object.freeze({ ...currentPreferences });
        applySettings();
        Object.keys(defaultPreferences).forEach(notifyPreferencesUpdate);
        document.querySelectorAll<HTMLInputElement>('input[data-preferences-key]').forEach(input => {
            syncPreferenceInput(input, input.dataset['preferencesKey']!);
        });
    });
    preferenceWrite = write.catch(() => undefined);
    await write;
    buildThemeInputs();
    getEBD<HTMLSelectElement>('settings-theme-profile').value = '';
    updateThemeProfileButtons();
    initPlaypenLib();
}

async function resetInventory() {
    if (!await confirmReset(
        'Reset Inventory',
        'This permanently deletes all spaces, categories, and items from the currently connected database. This cannot be undone.'
    )) return;

    try {
        if (!electroview.rpc?.request.resetInventory) throw new Error('The inventory reset service is unavailable.');
        await electroview.rpc.request.resetInventory();
        showNotification('The connected database inventory has been reset.');
    } catch (error) {
        console.error('Failed to reset the connected database inventory:', error);
        showNotification('Failed to reset the connected database inventory.', 'error');
    }
}

async function resetAllAppData() {
    try {
        if (!electroview.rpc?.request.resetAppData) throw new Error('The app-data reset service is unavailable.');
        await electroview.rpc.request.resetAppData();
        window.location.reload();
    } catch (error) {
        console.error('Failed to reset application data:', error);
        showNotification('Failed to reset application data.', 'error');
    }
}

function initTab() {
    if (tabInitialized) return;
    getEBD<HTMLButtonElement>('settings-reset').addEventListener('click', async () => {
        const option = await showPopup(
            'Choose something to reset',
            'Choose something to reset below.',
            'options',
            [
                { content: 'Everything', value: 'all' },
                { content: 'Preferences', value: 'preferences' },
                { content: 'Theme', value: 'theme' },
                { content: 'Local Inventory', value: 'inventory' },
                { content: 'Cancel', value: undefined, highlighted: true }
            ]
        );

        switch (option) {
            case 'all':
                if (
                    await showPopup(
                        'Confirm Reset',
                        'Are you sure you want to reset ALL app data? This cannot be undone.',
                        'options',
                        [
                            { content: 'Reset', value: true },
                            { content: 'Cancel', value: false, highlighted: true }
                        ],
                        undefined,
                        true
                    )
                ) resetAllAppData();
                break;
            case 'preferences':
                if (
                    await showPopup(
                        'Confirm Reset',
                        'Are you sure you want to reset all settings? This cannot be undone.',
                        'options',
                        [
                            { content: 'Reset', value: true },
                            { content: 'Cancel', value: false, highlighted: true }
                        ],
                        undefined,
                        true
                    )
                ) resetPreferences();
                break;
            case 'theme':
                if (
                    await showPopup(
                        'Confirm Reset',
                        'Are you sure you want to reset all theme settings? This cannot be undone. <br><br><span class="playpen-disclaimer">Note: You can export your themes as a file for sharing and later use.</span>',
                        'options',
                        [
                            { content: 'Reset', value: true },
                            { content: 'Cancel', value: false, highlighted: true }
                        ],
                        undefined,
                        true
                    )
                ) resetTheme();
                break;
            case 'inventory':
                if (
                    await showPopup(
                        'Confirm Reset',
                        'Are you sure you want to reset your inventory? This cannot be undone. <br><br><span class="playpen-disclaimer">Note: This only applies to your local inventory. Remote database inventory systems have to be reset from the Store Remote dashboard.</span>',
                        'options',
                        [
                            { content: 'Reset', value: true },
                            { content: 'Cancel', value: false, highlighted: true }
                        ],
                        undefined,
                        true
                    )
                ) resetInventory();
                break;
            default:
                break;
        }
    });
    tabInitialized = true;
}