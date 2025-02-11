export interface DatabaseOptions {
  url?: string;
  authToken?: string;
}

export interface QueryResult {
  operation: string;
  affected: number;
}

export interface DatabaseInterface {
  client: any;
  insert: (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ) => Promise<QueryResult>;
  get: (
    table: string,
    where: Record<string, any>,
  ) => Promise<Record<string, any> | null>;
  list: (
    table: string,
    where: Record<string, any>,
  ) => Promise<Record<string, any>[]>;
  update: (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ) => Promise<QueryResult>;
  getOrInsert: (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ) => Promise<Record<string, any>>;
  table: (table: string) => TableInterface;
  tableExists: (table: string) => Promise<boolean>;
  many: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;
  single: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any> | null>;
  pluck: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
  execute: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
  oo: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;
  oO: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any> | null>;
  ox: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
  xx: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
  query: (
    str: string,
    ...vars: any[]
  ) => Promise<{ rows: Record<string, any>[]; rowCount: number }>;
}

export interface TableInterface {
  insert: (
    data: Record<string, any> | Record<string, any>[],
  ) => Promise<QueryResult>;
  get: (where: Record<string, any>) => Promise<Record<string, any> | null>;
  list: (where: Record<string, any>) => Promise<Record<string, any>[]>;
}
