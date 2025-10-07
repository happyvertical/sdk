/**
 * Global type declarations for SMRT virtual modules
 * This file ensures TypeScript can find the generated module declarations
 */

/// <reference path="./lib/types/smrt-generated/smrt-client.d.ts" />
/// <reference path="./lib/types/smrt-generated/smrt-manifest.d.ts" />
/// <reference path="./lib/types/smrt-generated/smrt-mcp.d.ts" />
/// <reference path="./lib/types/smrt-generated/smrt-routes.d.ts" />
/// <reference path="./lib/types/smrt-generated/smrt-types.d.ts" />

// Re-export object types for convenience
export type { ProductData, CategoryData } from './lib/types/smrt-generated/smrt-objects';