export type TabOptions = {
    instant?: boolean;
    logPrevious?: boolean;
    display?: string;
}

export interface Space {
    id: number;
    name: string;
}

export interface Category {
    id: number;
    name: string;
    parent_space: number;
    parent_category: number | null;
    fields_template: string[] | string;
}

export interface ItemInput {
    name: string;
    quantity?: number;
    attributes?: Record<string, any>;
}

export interface Item {
    id: number;
    name: string;
    quantity: number;
    quantity_commited?: number;
    restock_point?: number;
    category_id: number;
    attributes: Record<string, any>;
}

export interface QueryRule {
    type: 'native' | 'attribute';
    field: string;
    operator: '=' | '>=' | '<=' | '>' | '<' | 'LIKE' | '!=';
    value: any;
}

export interface QueryUnifiedOptions {
    categoryId?: number | null;
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