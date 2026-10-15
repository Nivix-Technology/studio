import { electroview } from './index';
import { init as initNxLib } from './nxlib';
import { showNotification, showPopup } from './notifications';

type PreferenceValues = Record<string, any>;
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
    format: 'nivix-store-theme';
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
    { name: 'Primary Text', property: '--text-primary', section: 'Colors', description: 'The main text color used throughout the app.', type: 'color', defaultValue: '#313131' },
    { name: 'Light Text', property: '--text-tertiary', section: 'Colors', description: 'Text shown on colored or dark backgrounds.', type: 'color', defaultValue: '#ffffff' },
    { name: 'Primary Background', property: '--background-base', section: 'Colors', description: 'The main app background color.', type: 'color', defaultValue: '#f6f6f6' },
    { name: 'Background Color Contrast', property: '--background-color-step-amount', section: 'Colors', description: 'How much darker backgrounds are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 50, unit: '%' },
    { name: 'Accent Color Contrast', property: '--brand-color-step-amount', section: 'Colors', description: 'How much darker accent colored elements are than the ones they are stacked on top of. Increase this setting to increase contrast.', type: 'range', defaultValue: 12, min: 0, max: 50, unit: '%' },
    { name: 'Corner Radius', property: '--radius', section: 'Shape & spacing', description: 'How round corners are on things like buttons and menus.', type: 'range', defaultValue: 4, min: 0, max: 24, unit: 'px' },
    { name: 'Resting Area Padding', property: '--resting-area-padding', section: 'Shape & spacing', description: 'How much space there is around the inside of panels and other menus.', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },
    { name: 'Clickable Area Vertical Padding', property: '--clickable-area-padding-y', section: 'Shape & spacing', description: 'How much space there is between the text and the top and bottom of buttons and other clickable elements.', type: 'range', defaultValue: 0.4, min: 0, max: 2, step: 0.04, unit: 'rem' },
    { name: 'Clickable Area Horizontal Padding', property: '--clickable-area-padding-x', section: 'Shape & spacing', description: 'How much space there is between the text and the left and right of buttons and other clickable elements.', type: 'range', defaultValue: 1, min: 0, max: 3, step: 0.05, unit: 'rem' },
    { name: 'Element Gap', property: '--gap', section: 'Shape & spacing', description: 'The space between elements in lists, both left-right and top-bottom.', type: 'range', defaultValue: 5, min: 0, max: 24, unit: 'px' },
    { name: 'Transition Speed', property: '--transition-speed', section: 'Effects & motion', description: 'How long transition animations like fading and switching tabs take.', type: 'range', defaultValue: 0.2, min: 0.2, max: 10, step: 0.05, unit: 's' },
    { name: 'Transition Easing', property: '--transition-easing-style', section: 'Effects & motion', description: 'Linear: Animation is the same speed until the end. Ease In: Animation starts slow and ends fast. Ease Out: Animation starts fast and ends slow. Ease In Out: Starts slow, middle is fast, ends slow.', type: 'select', defaultValue: 'ease-out', options: ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] }
];

const themeDirectory = 'ThemeProfiles';
const themeFormat = 'nivix-store-theme';
const profileIdPattern = /^[\da-f-]{36}$/i;

let currentPreferences: PreferenceValues = { ...defaultPreferences };
export let preferences: Readonly<PreferenceValues> = Object.freeze({ ...currentPreferences });
let preferenceWrite: Promise<void> = Promise.resolve();
let settingsInputsInitialized = false;
let tabInitialized = false;
let savedThemeProfiles: SavedThemeProfile[] = [];

function getElement<T extends HTMLElement>(id: string): T {
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
    initNxLib();
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
            if (typeof value === 'number' && Number.isNaN(value)) value = currentPreferences[key];
            void setPreferences({ [key]: value }).catch(error => {
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

async function setPreferences(updates: PreferenceValues) {
    for (const [key, value] of Object.entries(updates)) {
        if (!(key in currentPreferences)) throw new Error(`Unknown preference: ${key}`);
        if (typeof value !== typeof currentPreferences[key]) {
            throw new Error(`Preference "${key}" must be a ${typeof currentPreferences[key]}.`);
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
    buildThemeInputs(readThemeVariables(preferences['themeVariables']));
    getElement<HTMLSelectElement>('settings-theme-profile').addEventListener('change', () => {
        void selectThemeProfile().catch(showThemeError);
    });
    getElement<HTMLButtonElement>('settings-theme-save-profile').addEventListener('click', () => {
        void saveThemeProfile().catch(showThemeError);
    });
    getElement<HTMLButtonElement>('settings-theme-import').addEventListener('click', () => {
        getElement<HTMLInputElement>('settings-theme-import-file').click();
    });
    getElement<HTMLInputElement>('settings-theme-import-file').addEventListener('change', event => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) void importThemeProfile(file).catch(showThemeError);
    });
    getElement<HTMLButtonElement>('settings-theme-export').addEventListener('click', () => {
        void exportThemeProfile().catch(showThemeError);
    });
    getElement<HTMLButtonElement>('settings-theme-delete').addEventListener('click', () => {
        void deleteThemeProfile().catch(showThemeError);
    });
    getElement<HTMLButtonElement>('settings-theme-reset').addEventListener('click', () => {
        void resetTheme().catch(showThemeError);
    });

    updateThemeProfileButtons();
    if (await manageThemeFile('createDirectory', themeDirectory) !== true) {
        throw new Error('Could not create the theme profile directory.');
    }
    await refreshThemeProfiles(String(preferences['themeProfileId'] ?? ''));
}

function buildThemeInputs(overrides: Record<string, ThemeValue>) {
    const container = getElement<HTMLDivElement>('settings-theme-variables');
    container.replaceChildren();
    let section = '';
    let sectionContainer: HTMLDivElement;

    for (const variable of themeVariables) {
        if (variable.section !== section) {
            section = variable.section;
            const group = document.createElement('section');
            group.className = 'theme-variable-group';
            const label = document.createElement('span');
            label.className = 'nivix-label';
            label.textContent = section;
            sectionContainer = document.createElement('div');
            sectionContainer.className = 'theme-variable-list';
            group.append(label, document.createElement('hr'), sectionContainer);
            container.append(group);
        }

        const value = overrides[variable.property] ?? variable.defaultValue;
        const id = `theme-variable-${variable.property.slice(2)}`;
        let input: HTMLInputElement | HTMLSelectElement;
        if (variable.type === 'select') {
            const select = document.createElement('select');
            select.className = 'nivix-select';
            variable.options!.forEach(option => select.add(new Option(option, option)));
            input = select;
        } else {
            const field = document.createElement('input');
            field.className = 'nivix-input';
            field.type = variable.type;
            if (variable.type === 'range') {
                field.min = String(variable.min);
                field.max = String(variable.max);
                field.step = String(variable.step ?? 1);
            }
            input = field;
        }
        input.id = id;
        input.value = String(value);

        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = variable.name;
        const help = document.createElement('button');
        help.type = 'button';
        help.className = 'tooltip-button tip-right';
        help.textContent = 'i';
        help.setAttribute('aria-label', `About ${variable.name}`);
        help.dataset['tooltipContent'] = variable.description;
        const valueLabel = document.createElement('span');
        valueLabel.className = 'theme-variable-value';

        const displayValue = (nextValue: ThemeValue) =>
            variable.type === 'range' ? `${nextValue}${variable.unit}` : String(nextValue);
        const updateValue = () => {
            const nextValue = variable.type === 'range' ? (input as HTMLInputElement).valueAsNumber : input.value;
            valueLabel.textContent = displayValue(nextValue);
            document.documentElement.style.setProperty(variable.property, themeCssValue(variable, nextValue));
        };
        valueLabel.textContent = displayValue(value);
        const control = document.createElement('div');
        control.className = 'theme-variable-control';
        control.append(input, valueLabel);
        const row = document.createElement('div');
        row.className = 'theme-variable';
        row.append(label, help, control);
        input.addEventListener('input', updateValue);
        input.addEventListener('change', () => {
            const nextValue = variable.type === 'range' ? (input as HTMLInputElement).valueAsNumber : input.value;
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

    const select = getElement<HTMLSelectElement>('settings-theme-profile');
    select.replaceChildren(new Option('Current theme', ''));
    savedThemeProfiles.forEach(profile => select.add(new Option(profile.name, profile.id)));
    select.value = savedThemeProfiles.some(profile => profile.id === selectedId) ? selectedId : '';
    updateThemeProfileButtons();
}

function updateThemeProfileButtons() {
    const selected = Boolean(getElement<HTMLSelectElement>('settings-theme-profile').value);
    getElement<HTMLButtonElement>('settings-theme-export').disabled = !selected;
    getElement<HTMLButtonElement>('settings-theme-delete').disabled = !selected;
}

async function selectThemeProfile() {
    const id = getElement<HTMLSelectElement>('settings-theme-profile').value;
    updateThemeProfileButtons();
    if (!id) return setPreferences({ themeProfileId: '' });

    const content = await manageThemeFile('read', themeProfilePath(id));
    if (typeof content !== 'string') throw new Error('The selected theme profile could not be read.');
    const profile = parseThemeProfile(content);
    await setPreferences({ themeVariables: profile.variables, themeProfileId: id });
    buildThemeInputs(profile.variables);
}

async function updateThemeVariable(variable: ThemeVariable, value: ThemeValue) {
    if (!isValidThemeValue(variable, value)) throw new Error(`Invalid value for ${variable.name}.`);
    const variables = readThemeVariables(preferences['themeVariables']);
    if (value === variable.defaultValue) delete variables[variable.property];
    else variables[variable.property] = value;

    const profileId = String(preferences['themeProfileId'] ?? '');
    await setPreferences({ themeVariables: variables });
    if (profileId) {
        const profile = savedThemeProfiles.find(item => item.id === profileId);
        if (!profile) throw new Error('The active theme profile could not be found.');
        const updated = { ...profile, variables };
        if (await manageThemeFile('write', themeProfilePath(profileId), JSON.stringify(updated, null, 2)) !== true) {
            throw new Error('The active theme profile could not be updated.');
        }
        profile.variables = variables;
    }
}

async function saveThemeProfile() {
    const nameInput = getElement<HTMLInputElement>('settings-theme-profile-name');
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
    buildThemeInputs(profile.variables);
    showNotification(`Theme profile "${profile.name}" imported.`);
}

async function exportThemeProfile() {
    const id = getElement<HTMLSelectElement>('settings-theme-profile').value;
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
        types: [{ description: 'Nivix Store theme', accept: { 'application/json': ['.storetheme'] } }]
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
    const id = getElement<HTMLSelectElement>('settings-theme-profile').value;
    const profile = savedThemeProfiles.find(item => item.id === id);
    if (!profile || !await confirmReset('Delete Theme Profile', `Delete the "${profile.name}" theme profile? This cannot be undone.`)) return;
    if (await manageThemeFile('delete', themeProfilePath(id)) !== true) {
        throw new Error('The theme profile could not be deleted.');
    }
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
    buildThemeInputs({});
    getElement<HTMLSelectElement>('settings-theme-profile').value = '';
    updateThemeProfileButtons();
    initNxLib();
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
    if (!await confirmReset(
        'Reset App Data',
        'This permanently deletes all data stored by this app on this device, including preferences, local inventory, and user files. The app will return to its default local database.'
    )) return;

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
    getElement<HTMLButtonElement>('settings-reset-appData').addEventListener('click', () => void resetAllAppData());
    getElement<HTMLButtonElement>('settings-reset-resetInventory').addEventListener('click', () => void resetInventory());
    getElement<HTMLButtonElement>('settings-reset-preferences').addEventListener('click', () => {
        void (async () => {
            try {
                if (!await confirmReset('Reset Preferences', 'This restores all preferences to their default values.')) return;
                await resetPreferences();
                showNotification('Preferences have been reset.');
            } catch (error) {
                console.error('Failed to reset preferences:', error);
                showNotification('Failed to reset preferences.', 'error');
            }
        })();
    });
    tabInitialized = true;
}
