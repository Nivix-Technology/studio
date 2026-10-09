import * as notifications from './notifications.ts';
import { preferences } from './settings.ts';

import { electroview } from "./index";
import type { tabChangeEventDetail } from "../../rpc/store-types.ts";

function getEBD<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

const form = getEBD<HTMLFormElement>('connectDatabase-form');
const submitBtn = getEBD<HTMLButtonElement>('connectDatabase-connect');

const prefixInput = getEBD<HTMLInputElement>('connectDatabase-prefix');
const hostnameInput = getEBD<HTMLInputElement>('connectDatabase-hostname');
const portInput = getEBD<HTMLInputElement>('connectDatabase-port');
const databaseInput = getEBD<HTMLInputElement>('connectDatabase-database');
const usernameInput = getEBD<HTMLInputElement>('connectDatabase-username');
const passwordInput = getEBD<HTMLInputElement>('connectDatabase-password');
const passwordVisibilityBtn = getEBD<HTMLButtonElement>('connectDatabase-password-toggle');
const clearFieldsBtn = getEBD<HTMLButtonElement>('connectDatabase-clear');

const urlInput = getEBD<HTMLInputElement>('connectDatabase-url');
const urlSubmitBtn = getEBD<HTMLButtonElement>('connectDatabase-url-submit');

const profileSelection = getEBD<HTMLSelectElement>('connectDatabase-profiles');
const profileLoadBtn = getEBD<HTMLButtonElement>('connectDatabase-profile-load');
const profileNameInput = getEBD<HTMLInputElement>('connectDatabase-profile-name');
const profileSaveBtn = getEBD<HTMLButtonElement>('connectDatabase-profile-save');
const profileDeleteBtn = getEBD<HTMLButtonElement>('connectDatabase-profile-delete');
const statusOutput = getEBD<HTMLSpanElement>('connectDatabase-status');
const disconnectBtn = getEBD<HTMLButtonElement>('connectDatabase-disconnect');

let isInitialized = false;
let connected = false;

type ConnectionDetails =
| { mode: 'fields'; prefix: string; hostname: string; port: string; database: string; username: string }
| { mode: 'url'; url: string };
type ConnectionProfile = { name: string; connection: ConnectionDetails };

let lastConnection: ConnectionDetails | null = null;
let profiles: ConnectionProfile[] = [];
let profilesLoaded = false;
let profilesLoading: Promise<void> | null = null;
let lastConnectionLoading: Promise<void> | null = null;

function isConnectionDetails(value: unknown): value is ConnectionDetails {
    if (typeof value !== 'object' || value === null || !('mode' in value)) return false;
    if (value.mode === 'url') return 'url' in value && typeof value.url === 'string';
    return value.mode === 'fields' &&
        'prefix' in value && typeof value.prefix === 'string' &&
        'hostname' in value && typeof value.hostname === 'string' &&
        'port' in value && typeof value.port === 'string' &&
        'database' in value && typeof value.database === 'string' &&
        'username' in value && typeof value.username === 'string';
}

function isConnectionProfile(value: unknown): value is ConnectionProfile {
    if (typeof value !== 'object' || value === null || !('name' in value) || !('connection' in value)) return false;
    return typeof value.name === 'string' && isConnectionDetails(value.connection);
}

function loadProfiles(): Promise<void> {
    if (profilesLoaded) return Promise.resolve();
    if (!profilesLoading) {
        profilesLoading = (async () => {
            const contents = await electroview.rpc?.request.manageStoreFile({
                operation: 'read',
                path: 'profiles.json'
            });
            if (contents !== null && typeof contents !== 'string') {
                throw new Error('Saved connection profiles could not be read.');
            }
            const storedProfiles: unknown = contents === null ? [] : JSON.parse(contents);
            if (!Array.isArray(storedProfiles) || !storedProfiles.every(isConnectionProfile)) {
                throw new Error('Saved connection profiles have an invalid format.');
            }
            profiles = storedProfiles;
            profilesLoaded = true;
            renderProfiles();
        })().finally(() => {
            profilesLoading = null;
        });
    }
    return profilesLoading;
}

function loadLastConnection(): Promise<void> {
    if (!lastConnectionLoading) {
        lastConnectionLoading = (async () => {
            const contents = await electroview.rpc?.request.manageStoreFile({
                operation: 'read',
                path: 'connectDatabase.json'
            });
            if (contents !== null && typeof contents !== 'string') {
                throw new Error('The last database connection could not be read.');
            }
            const storedConnection: unknown = contents === null ? null : JSON.parse(contents);
            if (storedConnection !== null && !isConnectionDetails(storedConnection)) {
                throw new Error('The last database connection has an invalid format.');
            }
            lastConnection = storedConnection;
        })().finally(() => {
            lastConnectionLoading = null;
        });
    }
    return lastConnectionLoading;
}

async function saveLastConnection(connection: ConnectionDetails | null) {
    const saved = await electroview.rpc?.request.manageStoreFile({
        operation: 'write',
        path: 'connectDatabase.json',
        content: JSON.stringify(connection, null, 2)
    });
    if (saved !== true) throw new Error('Failed to save the last database connection.');
    lastConnection = connection;
}

async function saveProfiles() {
    const saved = await electroview.rpc?.request.manageStoreFile({
        operation: 'write',
        path: 'profiles.json',
        content: JSON.stringify(profiles, null, 2)
    });
    if (saved !== true) throw new Error('Failed to save connection profiles.');
}

function sanitizeCustomURL(connectionString: string): string | null {
    try {
        const url = new URL(connectionString.trim());
        url.password = '';
        for (const key of [...url.searchParams.keys()]) {
            if (/pass(word)?|pwd|secret|token/i.test(key)) url.searchParams.delete(key);
        }
        return url.toString();
    } catch {
        return null;
    }
}

function currentConnectionDetails(): ConnectionDetails | null {
    const customURL = urlInput?.value.trim() || '';
    if (customURL) {
        const url = sanitizeCustomURL(customURL);
        return url ? { mode: 'url', url } : null;
    }
    
    return {
        mode: 'fields',
        prefix: prefixInput?.value.trim() || 'mysql://',
        hostname: hostnameInput?.value.trim() || '',
        port: portInput?.value.trim() || '',
        database: databaseInput?.value.trim() || '',
        username: usernameInput?.value.trim() || ''
    };
}

function getProfiles(): ConnectionProfile[] {
    return profiles;
}

function renderProfiles() {
    if (!profileSelection) return;
    const selected = profileSelection.value;
    profileSelection.replaceChildren(new Option('Select a saved profile', ''));
    
    if (lastConnection) profileSelection.add(new Option('Last Connection', '__last_connection__'));
    for (const profile of getProfiles()) profileSelection.add(new Option(profile.name, profile.name));
    
    profileSelection.value = [...profileSelection.options].some(option => option.value === selected) ? selected : '';
    updateProfileActions();
}

function updateProfileActions() {
    if (profileDeleteBtn) {
        profileDeleteBtn.disabled = !profileSelection?.value;
    }
}

function loadConnectionDetails(connection: ConnectionDetails) {
    if (connection.mode === 'url') {
        // Sanitize again in case a saved profile was edited manually.
        if (urlInput) urlInput.value = sanitizeCustomURL(connection.url) || '';
    } else {
        if (prefixInput) prefixInput.value = connection.prefix;
        if (hostnameInput) hostnameInput.value = connection.hostname;
        if (portInput) portInput.value = connection.port;
        if (databaseInput) databaseInput.value = connection.database;
        if (usernameInput) usernameInput.value = connection.username;
        if (urlInput) urlInput.value = '';
    }
    if (passwordInput) passwordInput.value = '';
}

function loadSelectedProfile() {
    const selected = profileSelection?.value;
    if (!selected) return;
    const connection = selected === '__last_connection__'
    ? lastConnection
    : getProfiles().find(profile => profile.name === selected)?.connection;
    if (!connection) return;
    loadConnectionDetails(connection);
    notifications.showNotification('Connection profile loaded.');
}

async function saveProfile() {
    await loadProfiles();
    const name = profileNameInput?.value.trim() || '';
    const connection = currentConnectionDetails();
    if (!name) {
        notifications.showNotification('Enter a name for this connection profile.', 'warning');
        profileNameInput?.focus();
        return;
    }
    if (!connection) {
        notifications.showNotification('Enter a valid custom URL before saving this profile.', 'warning');
        return;
    }
    if (connection.mode === 'fields' && (!connection.hostname || !connection.database)) {
        notifications.showNotification('Enter a host and database before saving this profile.', 'warning');
        return;
    }
    
    const previousProfiles = profiles;
    profiles = getProfiles().filter(profile => profile.name.toLocaleLowerCase() !== name.toLocaleLowerCase());
    profiles.push({ name, connection });
    try {
        await saveProfiles();
    } catch (error) {
        profiles = previousProfiles;
        throw error;
    }
    renderProfiles();
    if (profileSelection) profileSelection.value = name;
    updateProfileActions();
    if (profileNameInput) profileNameInput.value = '';
    notifications.showNotification(`Saved connection profile “${name}”.`);
}

async function deleteSelectedProfile() {
    await loadProfiles();
    const selected = profileSelection?.value;
    if (!selected) return;
    
    if (selected === '__last_connection__') {
        await saveLastConnection(null);
        notifications.showNotification('Deleted "Last Connection" profile.');
    } else {
        const previousProfiles = profiles;
        profiles = getProfiles().filter(profile => profile.name !== selected);
        try {
            await saveProfiles();
        } catch (error) {
            profiles = previousProfiles;
            throw error;
        }
        notifications.showNotification(`Deleted connection profile “${selected}”.`);
    }
    
    renderProfiles();
}

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && err !== null && 'message' in err) {
        return String((err as { message: unknown }).message);
    }
    return 'An unknown error occurred.';
}

function reportProfileError(action: string, error: unknown) {
    console.error(`Failed to ${action} connection profiles:`, error);
    notifications.showNotification(`Failed to ${action} connection profiles: ${getErrorMessage(error)}`, 'error');
}

function reportConnectionError(action: string, error: unknown) {
    console.error(`Failed to ${action} the last database connection:`, error);
    notifications.showNotification(`Failed to ${action} the last database connection: ${getErrorMessage(error)}`, 'error');
}

function setLoadingState(isLoading: boolean) {
    if (submitBtn) submitBtn.disabled = isLoading;
    if (urlSubmitBtn) urlSubmitBtn.disabled = isLoading;
    if (disconnectBtn) disconnectBtn.disabled = isLoading || !connected;
}

function clearConnectionFields() {
    form?.reset();
    if (urlInput) urlInput.value = '';
    if (passwordInput) passwordInput.type = 'password';
    if (passwordVisibilityBtn) {
        passwordVisibilityBtn.textContent = 'Show';
        passwordVisibilityBtn.setAttribute('aria-pressed', 'false');
    }
    hostnameInput?.focus();
}

function isValidConnectionString(connectionString: string): boolean {
    try {
        const parsableUrl = connectionString.replace(/^(mysql|mariadb|sqlite):\/\//i, 'http://');
        new URL(parsableUrl);
        return true;
    } catch {
        return false;
    }
}

export function init() {
    if (isInitialized) return false;

    form?.addEventListener('submit', (event) => {
        event.preventDefault();
        connectDatabase();
    });
    
    urlSubmitBtn?.addEventListener('click', () => {
        const url = urlInput?.value?.trim() || '';
        connectDatabase(url);
    });
    
    disconnectBtn?.addEventListener('click', disconnectDatabase);
    profileSelection?.addEventListener('change', updateProfileActions);
    profileLoadBtn?.addEventListener('click', loadSelectedProfile);
    profileSaveBtn?.addEventListener('click', () => {
        void saveProfile().catch(error => reportProfileError('save', error));
    });
    profileDeleteBtn?.addEventListener('click', () => {
        void deleteSelectedProfile().catch(error => reportProfileError('delete', error));
    });
    
    passwordVisibilityBtn?.addEventListener('click', () => {
        const showPassword = passwordInput?.type === 'password';
        if (passwordInput) passwordInput.type = showPassword ? 'text' : 'password';
        if (passwordVisibilityBtn) {
            passwordVisibilityBtn.textContent = showPassword ? 'Hide' : 'Show';
            passwordVisibilityBtn.setAttribute('aria-pressed', String(showPassword));
        }
    });
    clearFieldsBtn?.addEventListener('click', clearConnectionFields);
    
    isInitialized = true;
    renderProfiles();
    void loadProfiles().catch(error => reportProfileError('load', error));
    void loadLastConnection()
        .then(renderProfiles)
        .catch(error => reportConnectionError('load', error));
    void syncConnectionState();
    return true;
}

/** Reflect the database selected by the Bun process after this view is loaded. */
async function syncConnectionState() {
    if (!electroview?.rpc?.request?.getDatabase) return;
    
    try {
        setLoadingState(true);
        const database = await electroview.rpc.request.getDatabase();
        connected = database === 'sql';
        
        if (!connected) {
            if (statusOutput) statusOutput.innerText = 'Not Connected';
            return;
        }
        
        const reachable = await electroview.rpc.request.pingServer();
        if (statusOutput) {
            statusOutput.innerText = reachable
            ? 'Connected to Database'
            : 'Database Connection Unavailable';
        }
    } catch (err) {
        connected = false;
        if (statusOutput) statusOutput.innerText = 'Connection Status Unavailable';
        console.warn('Failed to synchronize database connection state:', err);
    } finally {
        setLoadingState(false);
    }
}

async function connectDatabase(customURL?: string) {
    let target = '';
    
    if (!electroview?.rpc?.request?.setDatabase) {
        notifications?.showNotification('RPC Connection unavailable. Please restart the application.', 'error');
        return;
    }
    
    if (customURL) {
        target = customURL.trim();
        if (!target) {
            notifications?.showNotification('Please enter a valid connection URL.', 'warning');
            return;
        }
    } else {
        const prefix = prefixInput?.value?.trim() || 'mysql://';
        const hostname = hostnameInput?.value?.trim() || '';
        const port = portInput?.value?.trim() || '';
        const database = databaseInput?.value?.trim() || '';
        const username = usernameInput?.value?.trim() || '';
        const password = passwordInput?.value?.trim() || '';
        
        if (!hostname) {
            notifications?.showNotification('Please provide a host or IP address.', 'warning');
            hostnameInput?.focus();
            return;
        }
        
        if (!database) {
            notifications?.showNotification('Please specify a database name.', 'warning');
            databaseInput?.focus();
            return;
        }
        
        if (port) {
            const parsedPort = Number(port);
            if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
                notifications?.showNotification('Please enter a valid port number (1-65535).', 'warning');
                portInput?.focus();
                return;
            }
        }
        
        const encodedUser = encodeURIComponent(username);
        const encodedPass = encodeURIComponent(password);
        
        const auth = encodedUser ? (encodedPass ? `${encodedUser}:${encodedPass}@` : `${encodedUser}@`) : '';
        const portPart = port ? `:${port}` : '';
        const scheme = prefix.endsWith('://') ? prefix : `${prefix}://`;
        
        target = `${scheme}${auth}${hostname}${portPart}/${database}`;
    }
    
    if (!isValidConnectionString(target)) {
        notifications?.showNotification('Invalid connection URL format generated. Please check your inputs.', 'error');
        return;
    }
    
    try {
        setLoadingState(true);
        notifications?.showNotification('Attempting to connect to database...');
        if (statusOutput) statusOutput.innerText = 'Connecting to database...';
        
        await electroview.rpc.request.setDatabase({
            database: 'sql',
            databasePath: target
        });
        
        connected = true;
        const lastConnection = currentConnectionDetails();
        if (lastConnection && preferences['saveLastConnection']) {
            try {
                await saveLastConnection(lastConnection);
                renderProfiles();
            } catch (error) {
                reportConnectionError('save', error);
            }
        }
        notifications?.showNotification('Successfully connected to database!');
        if (statusOutput) statusOutput.innerText = 'Connected to Database';
    } catch (err) {
        connected = false;
        const message = getErrorMessage(err);
        notifications?.showNotification(`Failed to connect to database: ${message}`, 'error');
        if (statusOutput) statusOutput.innerText = 'Connection Failed';
    } finally {
        setLoadingState(false);
    }
}

async function disconnectDatabase() {
    if (!connected) {
        notifications?.showNotification("You aren't connected to a remote database.", 'warning');
        return;
    }
    
    if (!electroview?.rpc?.request?.setDatabase) {
        notifications?.showNotification('RPC Connection unavailable. Please restart the application.', 'error');
        return;
    }
    
    try {
        setLoadingState(true);
        notifications?.showNotification('Disconnecting from remote database...');
        if (statusOutput) statusOutput.innerText = 'Disconnecting...';
        
        await electroview.rpc.request.setDatabase({ database: 'sqlite' });
        
        connected = false;
        if (statusOutput) statusOutput.innerText = 'Not Connected';
        notifications?.showNotification('Disconnected from remote database. Switched to local SQLite.');
    } catch (err) {
        const message = getErrorMessage(err);
        notifications?.showNotification(`Failed to disconnect from remote database: ${message}`, 'error');
        if (statusOutput) statusOutput.innerText = 'Connected to Database';
    } finally {
        setLoadingState(false);
    }
}

window.addEventListener('tabChange', (event) => {
    const eventDetails = event as CustomEvent<tabChangeEventDetail>;
    const { tabId } = eventDetails.detail;
    if (tabId === 'connectDatabase') {
        if (!init()) void syncConnectionState();
    }
});