import { Electroview } from "electrobun/view";
import { type StoreRPCType } from '../../shared/bun/store-rpc-types';

import { showPopup } from "./notifications";

import * as load from './load';
// Register tab listeners for the database screen (and its select-space dependency).
import './connectDatabase';

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

export async function quit() {
    const confirmation = await showPopup(
        "Exiting Nivix Store",
        "Are you sure you want to exit Nivix Store?", "options", 
        [
            { content: "No", value: false, highlighted: true },
            { content: "Yes", value: true, highlighted: false }
        ]
    );

    if (confirmation === true) {
        electroview.rpc?.send.closeStore();
    }
}