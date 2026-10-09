// @ts-expect-error Electrobun's RPC types are provided by the build toolchain.
import type { RPCSchema } from "electrobun";

export type UpdaterRPCType = {
    bun: RPCSchema<{
        requests: {
            ready: {
                params: void;
                response: boolean;
            };
            checkUpdate: {
                params: void;
                response: string | false;
            };
            storeHandoff: {
                params: void;
                response: void;
            };
            close: {
                params: void;
                response: void;
            };
        };
        messages: {};
    }>;
    webview: RPCSchema<{
        requests: {};
        messages: {
            displayDebug: {
                message: string;
                type?: string;
            };
        };
    }>;
};