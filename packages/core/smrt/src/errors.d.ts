/**
 * Comprehensive error handling system for SMRT framework
 *
 * Provides specialized error types for different failure scenarios
 * with proper error codes, messages, and debugging information.
 */
/**
 * Base error class for all SMRT framework errors
 */
export declare abstract class SmrtError extends Error {
    readonly code: string;
    readonly category: 'database' | 'ai' | 'filesystem' | 'validation' | 'network' | 'configuration' | 'runtime';
    readonly details?: Record<string, any>;
    readonly cause?: Error;
    constructor(message: string, code: string, category: SmrtError['category'], details?: Record<string, any>, cause?: Error);
    /**
     * Converts error to a serializable object for logging/debugging
     */
    toJSON(): {
        name: string;
        message: string;
        code: string;
        category: "runtime" | "database" | "ai" | "filesystem" | "validation" | "network" | "configuration";
        details: Record<string, any> | undefined;
        stack: string | undefined;
        cause: {
            name: string;
            message: string;
            stack: string | undefined;
        } | undefined;
    };
}
/**
 * Database-related errors
 */
export declare class DatabaseError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static connectionFailed(dbUrl: string, cause?: Error): DatabaseError;
    static queryFailed(query: string, cause?: Error): DatabaseError;
    static schemaError(tableName: string, operation: string, cause?: Error): DatabaseError;
    static constraintViolation(constraint: string, value: any, cause?: Error): DatabaseError;
}
/**
 * AI integration errors
 */
export declare class AIError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static providerError(provider: string, operation: string, cause?: Error): AIError;
    static rateLimitExceeded(provider: string, retryAfter?: number): AIError;
    static invalidResponse(provider: string, response: any): AIError;
    static authenticationFailed(provider: string): AIError;
}
/**
 * Filesystem operation errors
 */
export declare class FilesystemError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static fileNotFound(path: string): FilesystemError;
    static permissionDenied(path: string, operation: string): FilesystemError;
    static diskSpaceExceeded(path: string, requiredBytes: number): FilesystemError;
}
/**
 * Data validation errors
 */
export declare class ValidationError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static requiredField(fieldName: string, objectType: string): ValidationError;
    static invalidValue(fieldName: string, value: any, expectedType: string): ValidationError;
    static uniqueConstraint(fieldName: string, value: any): ValidationError;
    static rangeError(fieldName: string, value: number, min?: number, max?: number): ValidationError;
}
/**
 * Network and external service errors
 */
export declare class NetworkError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static requestFailed(url: string, status?: number, cause?: Error): NetworkError;
    static timeout(url: string, timeoutMs: number): NetworkError;
    static serviceUnavailable(service: string): NetworkError;
}
/**
 * Configuration and setup errors
 */
export declare class ConfigurationError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static missingConfiguration(configKey: string, context?: string): ConfigurationError;
    static invalidConfiguration(configKey: string, value: any, expected: string): ConfigurationError;
    static initializationFailed(component: string, cause?: Error): ConfigurationError;
}
/**
 * Runtime execution errors
 */
export declare class RuntimeError extends SmrtError {
    constructor(message: string, code: string, details?: Record<string, any>, cause?: Error);
    static operationFailed(operation: string, context?: string, cause?: Error): RuntimeError;
    static invalidState(state: string, expected: string): RuntimeError;
    static resourceExhausted(resource: string, limit: number): RuntimeError;
}
/**
 * Utility functions for error handling
 */
export declare class ErrorUtils {
    /**
     * Wraps a function with error handling and automatic retry logic
     */
    static withRetry<T>(operation: () => Promise<T>, maxRetries?: number, delay?: number, backoffMultiplier?: number): Promise<T>;
    /**
     * Checks if an error is retryable
     */
    static isRetryable(error: Error): boolean;
    /**
     * Sanitizes an error for safe logging (removes sensitive information)
     */
    static sanitizeError(error: Error): Record<string, any>;
}
