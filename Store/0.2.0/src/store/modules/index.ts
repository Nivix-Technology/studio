import { Electroview } from "electrobun/view";
import { type StoreRPCType } from '../../shared/bun/store-rpc-types';

import { showPopup } from "./notifications";

import * as load from './load';

// Import all modules that listen for tabchange events, so electrobun can package them, and all top-level code is ran.
import './connectDatabase';
import './createSpace';
import './selectSpace';

const rpc = Electroview.defineRPC<StoreRPCType>({
    handlers: {
        requests: {},
        messages: {},
    }
});
export const electroview = new Electroview({ rpc });

export const store = {
    "sessionVersion": "0.2.0"
}

load.checkLoadState();

export async function exit() {
    const confirmation = await showPopup(
        "Exiting Nivix Store",
        "Are you sure you want to exit Nivix Store?", "options", 
        [
            { content: "Cancel", value: false, highlighted: true },
            { content: "Exit", value: true, highlighted: false }
        ]
    );
    
    if (confirmation === true) {
        electroview.rpc?.send.closeStore();
    }
}

export async function restart() {
    const confirmation = await showPopup(
        'Restart Nivix Store',
        `All unsaved progress will be lost.`,
        "options",
        [
            { content: "Cancel", value: false, highlighted: true },
            { content: "Restart", value: true, highlighted: false }
        ]
    );
    
    if (confirmation) window.location.reload();
}