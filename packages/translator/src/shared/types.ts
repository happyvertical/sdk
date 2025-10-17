/**
 * Core types and interfaces for the Translator library
 */

/**
 * Standardized translation result
 */
export interface TranslationResult {
  /**
   * The translated text
   */
  translatedText: string;

  /**
   * The original source text
   */
  sourceText: string;

  /**
   * The detected or specified source language (ISO 639-1 code)
   */
  sourceLanguage: string;

  /**
   * The target language (ISO 639-1 code)
   */
  targetLanguage: string;

  /**
   * Confidence score for the translation (0-1), if available
   */
  confidence?: number;

  /**
   * Alternative translations, if available
   */
  alternatives?: string[];

  /**
   * Whether the source language was automatically detected
   */
  detectedSourceLanguage: boolean;

  /**
   * The original, raw response from the provider
   */
  raw: any;
}

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  /**
   * The detected language (ISO 639-1 code)
   */
  language: string;

  /**
   * Confidence score for the detection (0-1)
   */
  confidence: number;

  /**
   * Alternative detected languages with confidence scores, if available
   */
  alternatives?: Array<{
    language: string;
    confidence: number;
  }>;

  /**
   * The original, raw response from the provider
   */
  raw: any;
}

/**
 * Supported language information
 */
export interface SupportedLanguage {
  /**
   * ISO 639-1 language code (e.g., 'en', 'es', 'fr')
   */
  code: string;

  /**
   * Human-readable language name in English
   */
  name: string;

  /**
   * Native name of the language (optional)
   */
  nativeName?: string;
}

/**
 * Translation provider interface - all providers must implement this
 */
export interface TranslationProvider {
  /**
   * Translates text from source language to target language
   * @param text The text to translate
   * @param targetLanguage The target language code (ISO 639-1)
   * @param sourceLanguage Optional source language code. If not provided, auto-detect
   * @returns A promise that resolves to a TranslationResult object
   */
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult>;

  /**
   * Detects the language of the provided text
   * @param text The text to analyze
   * @returns A promise that resolves to a LanguageDetectionResult object
   */
  detectLanguage(text: string): Promise<LanguageDetectionResult>;

  /**
   * Gets the list of languages supported by this provider
   * @returns A promise that resolves to an array of SupportedLanguage objects
   */
  getSupportedLanguages(): Promise<SupportedLanguage[]>;

  /**
   * Translates multiple texts in a single batch operation
   * @param texts Array of texts to translate
   * @param targetLanguage The target language code (ISO 639-1)
   * @param sourceLanguage Optional source language code. If not provided, auto-detect
   * @returns A promise that resolves to an array of TranslationResult objects
   */
  translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult[]>;
}

/**
 * Translator interface - extends provider interface with convenience methods
 */
export interface Translator extends TranslationProvider {
  /**
   * Creates a pre-configured translation function for repeated translations
   * @param sourceLanguage Optional source language code (ISO 639-1). If undefined, auto-detects
   * @param targetLanguage Optional target language code (ISO 639-1). Defaults to 'en'
   * @returns A function that translates text with the pre-configured languages
   */
  templateFunction(
    sourceLanguage?: string,
    targetLanguage?: string,
  ): (text: string) => Promise<string>;
}

/**
 * Base configuration options for all providers
 */
export interface BaseTranslatorOptions {
  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Maximum number of retries for failed requests
   */
  maxRetries?: number;
}

/**
 * Google Translate provider options
 */
export interface GoogleTranslateOptions extends BaseTranslatorOptions {
  provider: 'google';
  /**
   * Google Cloud API key or credentials
   */
  apiKey: string;
  /**
   * Optional Google Cloud project ID
   */
  projectId?: string;
}

/**
 * DeepL provider options
 */
export interface DeepLOptions extends BaseTranslatorOptions {
  provider: 'deepl';
  /**
   * DeepL API key
   */
  apiKey: string;
  /**
   * Whether to use free or pro API endpoint (default: false = pro)
   */
  freeApi?: boolean;
}

/**
 * LibreTranslate provider options
 */
export interface LibreTranslateOptions extends BaseTranslatorOptions {
  provider: 'libretranslate';
  /**
   * Custom instance URL (default: https://libretranslate.com)
   */
  apiUrl?: string;
  /**
   * Optional API key for some instances
   */
  apiKey?: string;
}

/**
 * Union type for all provider options
 */
export type TranslatorOptions =
  | GoogleTranslateOptions
  | DeepLOptions
  | LibreTranslateOptions;

/**
 * Base error class for translation operations
 */
export class TranslationError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

/**
 * Unsupported language error
 */
export class UnsupportedLanguageError extends TranslationError {
  constructor(language: string, provider?: string) {
    super(
      `Unsupported language: ${language}`,
      'UNSUPPORTED_LANGUAGE',
      provider,
    );
    this.name = 'UnsupportedLanguageError';
  }
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends TranslationError {
  constructor(provider?: string) {
    super('Translation quota exceeded', 'QUOTA_EXCEEDED', provider);
    this.name = 'QuotaExceededError';
  }
}

/**
 * API authentication error
 */
export class AuthenticationError extends TranslationError {
  constructor(provider?: string) {
    super('Authentication failed', 'AUTH_ERROR', provider);
    this.name = 'AuthenticationError';
  }
}

/**
 * Invalid text error
 */
export class InvalidTextError extends TranslationError {
  constructor(reason: string, provider?: string) {
    super(`Invalid text: ${reason}`, 'INVALID_TEXT', provider);
    this.name = 'InvalidTextError';
  }
}
