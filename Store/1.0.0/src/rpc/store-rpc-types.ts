// @ts-expect-error Electrobun's RPC types are provided by the build toolchain.
import type { RPCSchema } from "electrobun";
import type { DatabaseType } from "./store-types";

export type StoreRPCType = {
    bun: RPCSchema<{
        requests: {
            getPreferences: {
                params: void;
                response: Record<string, any>;
            };
            setPreferences: {
                params: object;
                response: boolean;
            };
            resetInventory: {
                params: void;
                response: void;
            };
            resetAppData: {
                params: void;
                response: void;
            };
            createSpace: {
                params: string;
                response: any;
            };
            listSpaces: {
                params: void;
                response: any;
            };
            renameSpace: {
                params: {
                    id: number;
                    name: string;
                };
                response: any;
            };
            deleteSpace: {
                params: number;
                response: any;
            };
            createCategory: {
                params: {
                    name: string;
                    space: number;
                    id?: number | null;
                    fields?: string[];
                };
                response: any;
            };
            listCategories: {
                params: number;
                response: any;
            };
            renameCategory: {
                params: {
                    id: number;
                    name: string;
                };
                response: any;
            };
            deleteCategory: {
                params: number;
                response: any;
            };
            createItem: {
                params: {
                    name: string;
                    category: number;
                    quantity?: number;
                    attributes?: object;
                };
                response: any;
            };
            deleteItem: {
                params: number;
                response: any;
            };
            listAllItemsInCategoryRecursive: {
                params: number;
                response: any;
            };
            updateItem: {
                params: {
                    id: number;
                    updates?: object;
                };
                response: any;
            };
            listItemsByCategory: {
                params: number;
                response: any;
            };
            getItemById: {
                params: number;
                response: any;
            };
            queryItems: {
                params: {
                    category?: number | null;
                    rules?: import("./store-types").QueryRule[];
                    logicalOp?: 'AND' | 'OR';
                } | void;
                response: any;
            };
            rebuildSearchIndex: {
                params: void;
                response: any;
            };
            convert: {
                params: {
                    version: string;
                    space: number;
                };
                response: any;
            };
            readFile: {
                params: {
                    path: string;
                };
                response: string;
            };
            manageStoreFile: {
                params: {
                    operation: 'read' | 'write' | 'list' | 'createDirectory' | 'delete' | 'clearDirectory';
                    path: string;
                    content?: string;
                };
                response: string | string[] | boolean | null;
            };
            setDatabase: {
                params: {
                    database: DatabaseType;
                    databasePath?: string;
                };
                response: void;
            };
            getDatabase: {
                params: void;
                response: DatabaseType | null;
            };
            pingServer: {
                params: void;
                response: boolean;
            };
        };
        messages: {
            closeStore: void;
        };
    }>;
    webview: RPCSchema<{
        requests: {};
        messages: {};
    }>;
};