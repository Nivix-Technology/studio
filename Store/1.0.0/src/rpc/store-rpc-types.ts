// @ts-expect-error Electrobun's RPC types are provided by the build toolchain.
import type { RPCSchema } from "electrobun";
import type { DatabaseType } from "./store-types";
import type { 
    Space, 
    Category, 
    Item, 
    CategoryAttributeInput, 
    ItemInput, 
    SupportedVersion, 
    ChunkCap, 
    InspectionResult 
} from "../bun/database-driver";

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

            // --- SPACES ---
            createSpace: {
                params: {
                    name: string;
                    imageBase64?: string | null;
                };
                response: number | bigint;
            };
            updateSpace: {
                params: {
                    id: number | bigint;
                    updates: {
                        name?: string;
                        imageBase64?: string | null;
                    };
                };
                response: boolean;
            };
            listSpaces: {
                params: void;
                response: Space[];
            };
            deleteSpace: {
                params: number | bigint;
                response: boolean;
            };

            // --- CATEGORIES ---
            createCategory: {
                params: {
                    spaceId: number | bigint;
                    name: string;
                    parentCategoryId?: number | bigint | null;
                    attributes?: CategoryAttributeInput[];
                };
                response: number | bigint;
            };
            updateCategory: {
                params: {
                    id: number | bigint;
                    updates: {
                        name?: string;
                        spaceId?: number | bigint;
                        parentCategoryId?: number | bigint | null;
                    };
                };
                response: boolean;
            };
            listCategories: {
                params: number | bigint; // spaceId
                response: Category[];
            };
            deleteCategory: {
                params: number | bigint;
                response: boolean;
            };

            // --- ITEMS ---
            createItem: {
                params: ItemInput;
                response: number | bigint;
            };
            getItemById: {
                params: number | bigint;
                response: Item | null;
            };
            deleteItem: {
                params: number | bigint;
                response: boolean;
            };

            // --- CONVERSION & INSPECTION ---
            detectFileVersion: {
                params: string; // filePath or content string
                response: InspectionResult;
            };
            convert: {
                params: {
                    source: string; // file path or string content
                    options: {
                        sourceVersion?: SupportedVersion | 'auto';
                        targetSpaceId: number | bigint;
                        chunkCap?: ChunkCap;
                    };
                };
                response: {
                    importedItems: number;
                    importedCategories: number;
                };
            };

            // --- FILE SYSTEM & CONFIG ---
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