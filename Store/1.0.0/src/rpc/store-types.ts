export type TabOptions = {
    instant?: boolean;
    logPrevious?: boolean;
    display?: string;
    removePrevious?: boolean;
}

export type DatabaseType = 'sqlite' | 'remote';

export interface Space {
    id: number | bigint;
    name: string;
}

export interface Category {
    id: number | bigint;
    name: string;
    parent_space: number | bigint;
    parent_category: number | bigint | null;
    fields_template: string[] | string;
}

export interface ItemInput {
    name: string;
    quantity?: number;
    attributes?: Record<string, any>;
}

export interface Item {
    id: number | bigint;
    name: string;
    quantity: number;
    quantity_commited?: number;
    restock_point?: number;
    category_id: number | bigint;
    attributes: Record<string, any>;
}

export interface QueryRule {
    type: 'native' | 'attribute';
    field: string;
    operator: '=' | '>=' | '<=' | '>' | '<' | 'LIKE' | '!=';
    value: any;
}

export interface QueryUnifiedOptions {
    categoryId?: number | bigint | null;
    rules?: QueryRule[];
    logicalOp?: 'AND' | 'OR';
}

export interface tabChangeEventDetail {
    tabId: string;
}

export interface preferenceUpdateEventDetail {
    preference: string;
}

export type ChunkCap = 'auto' | 'max' | number;