// @ts-expect-error Electrobun's SDK modules are provided by the build toolchain.
import { Updater, Utils } from "electrobun/bun";
import path from 'node:path';
import fs from 'node:fs/promises';

const storePath = path.join(Utils.paths.userData, 'store');
const skippedVersionFilePath = path.join(storePath, 'skippedVersion.txt');

let updateInfo: any = null;
let skippedVersion: string | null = null;

export async function init() {
    try {
        await fs.mkdir(storePath, { recursive: true });
    } catch {
        // Ignore if directory already exists
    }

    try {
        skippedVersion = await fs.readFile(skippedVersionFilePath, { encoding: 'utf-8' });
    } catch (err) {
        skippedVersion = null;
    }

    if (!Updater || typeof Updater.checkForUpdate !== 'function') {
        console.warn('Updater module is not available in this environment');
        updateInfo = { updateAvailable: false };
        return;
    }

    try {
        updateInfo = await Updater.checkForUpdate();
    } catch (err: any) {
        console.error('Failed to check for updates:', err?.message || err);
        updateInfo = { updateAvailable: false };
    }
}

export async function updateAvailable() {
    if (!updateInfo) {
        return false; 
    }

    try {
        if (skippedVersion && skippedVersion.trim() === updateInfo?.version) {
            return false;
        }
        
        if (updateInfo?.updateAvailable) {
            return updateInfo?.version || false;
        }
        
        return false;
    } catch (err: any) {
        console.error(`Update check calculation failed: ${err?.message}`);
        return false;
    }
}

export async function update() {
    if (!Updater?.downloadUpdate) return;
    await Updater.downloadUpdate();
}

export async function restart() {
    if (Updater?.applyUpdate) {
        Updater.applyUpdate();
    }
}

export async function skipVersion() {
    const versionToSkip = updateInfo?.version;
    if (!versionToSkip) return;

    try {
        await fs.mkdir(storePath, { recursive: true });
        await fs.writeFile(skippedVersionFilePath, versionToSkip.trim(), { encoding: 'utf-8' });
        skippedVersion = versionToSkip;
    } catch (err: any) {
        console.error(`Failed to save skipped version: ${err?.message}`);
    }
}