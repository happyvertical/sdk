/**
 * Utility functions for translation operations
 */
/**
 * Common ISO 639-1 language codes and their names
 */
export declare const LANGUAGE_NAMES: Record<string, string>;
/**
 * Validates an ISO 639-1 language code
 * @param code Language code to validate
 * @returns True if valid
 */
export declare function isValidLanguageCode(code: string): boolean;
/**
 * Gets the language name from a language code
 * @param code ISO 639-1 language code
 * @returns Language name or the code if not found
 */
export declare function getLanguageName(code: string): string;
/**
 * Normalizes a confidence score to 0-1 range
 * @param score Confidence score (may be 0-1 or 0-100)
 * @returns Normalized score between 0 and 1
 */
export declare function normalizeConfidence(score: number): number;
/**
 * Validates that text is not empty
 * @param text Text to validate
 * @returns True if text is valid
 */
export declare function isValidText(text: string): boolean;
/**
 * Truncates text to a maximum length
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @returns Truncated text
 */
export declare function truncateText(text: string, maxLength: number): string;
//# sourceMappingURL=utils.d.ts.map