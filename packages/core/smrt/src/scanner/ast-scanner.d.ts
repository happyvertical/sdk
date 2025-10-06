/**
 * AST scanner for parsing @smrt() decorated classes
 * Uses TypeScript Compiler API to extract metadata
 */
import type { ScanOptions, ScanResult } from './types';
export declare class ASTScanner {
    private program;
    private checker;
    private options;
    constructor(filePaths: string[], options?: ScanOptions);
    /**
     * Scan files for SMRT object definitions
     */
    scanFiles(): ScanResult[];
    /**
     * Scan a single source file
     */
    private scanFile;
    /**
     * Parse a class declaration for SMRT metadata
     */
    private parseClassDeclaration;
    /**
     * Find @smrt() decorator on class
     */
    private findSmrtDecorator;
    /**
     * Check if class extends a SMRT base class
     */
    private extendsBaseClass;
    /**
     * Parse decorator configuration from @smrt(config)
     */
    private parseDecoratorConfig;
    /**
     * Parse property declaration to field definition
     */
    private parsePropertyDeclaration;
    /**
     * Parse method declaration to method definition
     */
    private parseMethodDeclaration;
    /**
     * Get property/method name as string
     */
    private getPropertyName;
    /**
     * Infer field type from TypeScript AST
     */
    private inferFieldType;
    /**
     * Extract default value from initializer
     */
    private extractDefaultValue;
    /**
     * Check if type annotation includes undefined or optional types
     */
    private hasOptionalType;
    /**
     * Simple pluralization (can be enhanced)
     */
    private pluralize;
}
/**
 * Convenience function to scan files
 */
export declare function scanFiles(filePaths: string[], options?: ScanOptions): ScanResult[];
/**
 * Scan a single file
 */
export declare function scanFile(filePath: string, options?: ScanOptions): ScanResult;
