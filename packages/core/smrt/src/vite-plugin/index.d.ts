/**
 * Vite plugin for automatic SMRT service generation
 * Provides virtual modules for REST, MCP, and other services
 */
import type { Plugin } from 'vite';
import type { SmartObjectManifest } from '../scanner/types';
export interface SmrtPluginOptions {
    /** Glob patterns for SMRT source files */
    include?: string[];
    /** Patterns to exclude */
    exclude?: string[];
    /** Output directory for generated files */
    outDir?: string;
    /** Enable hot module replacement */
    hmr?: boolean;
    /** Watch for file changes */
    watch?: boolean;
    /** Generate types */
    generateTypes?: boolean;
    /** Custom base classes to scan for */
    baseClasses?: string[];
    /** Directory to write TypeScript declarations (relative to project root) */
    typeDeclarationsPath?: string;
    /** Plugin execution mode - controls Node.js vs browser compatibility */
    mode?: 'server' | 'client' | 'auto';
    /** Pre-generated manifest for client mode (avoids file scanning) */
    staticManifest?: SmartObjectManifest;
    /** Path to static manifest file for client mode */
    manifestPath?: string;
}
export declare function smrtPlugin(options?: SmrtPluginOptions): Plugin;
