// @ts-expect-error discord-rpc does not provide TypeScript declarations.
import { Client } from "discord-rpc";

const CLIENT_ID = "1555714033653514240";
const rpc = new Client({ transport: "ipc" });

rpc.on("ready", () => {
    console.log("Connected to RPC");
});

rpc.login({ clientId: CLIENT_ID }).catch((err: any) => {
    console.error("Failed to connect to Discord RPC: ", err);
});

process.on("beforeExit", () => {
    rpc.destroy().catch(() => {});
});

export function updatePresence(details: string, state: string) {
    if (!rpc) return;
    
    rpc.setActivity({
        details,
        state,
        startTimestamp: new Date(),
        largeImageKey: "logo_large",
        largeImageText: "Nivix Store",
    }).catch(console.error);
}