/**
 * Google Translate provider implementation
 */

import { v2 } from '@google-cloud/translate';
import type { CacheAdapter } from '@have/cache';
import { getCache } from '@have/cache';
import type {
  GoogleTranslateOptions,
  LanguageDetectionResult,
  SupportedLanguage,
  TranslationProvider,
  TranslationResult,
} from '../shared/types';
import {
  AuthenticationError,
  InvalidTextError,
  QuotaExceededError,
  TranslationError,
  UnsupportedLanguageError,
} from '../shared/types';
import {
  getLanguageName,
  isValidText,
  normalizeConfidence,
} from '../shared/utils';

const { Translate } = v2;

/**
 * Google Translate provider implementation with in-memory caching
 */
export class GoogleTranslateProvider implements TranslationProvider {
  private client: InstanceType<typeof Translate>;
  private timeout: number;
  private cache: CacheAdapter | null = null;

  constructor(options: GoogleTranslateOptions) {
    this.client = new Translate({
      key: options.apiKey,
      projectId: options.projectId,
    });
    this.timeout = options.timeout || 30000;

    // Initialize memory cache asynchronously
    this.initCache();
  }

  /**
   * Initializes the memory cache for translation results
   */
  private async initCache(): Promise<void> {
    try {
      this.cache = await getCache({
        provider: 'memory',
        namespace: 'translator:google',
        defaultTTL: 3600, // 1 hour cache
        maxSize: 10 * 1024 * 1024, // 10MB
        maxEntries: 1000,
        evictionPolicy: 'lru',
      });
    } catch (error) {
      // Cache initialization failure shouldn't break the provider
      console.warn('Failed to initialize translation cache:', error);
    }
  }

  /**
   * Generates a cache key for translation requests
   */
  private getCacheKey(type: string, ...parts: string[]): string {
    return `${type}:${parts.join(':')}`;
  }

  /**
   * Translates text from source language to target language
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    if (!isValidText(text)) {
      throw new InvalidTextError('Text cannot be empty', 'google');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(
      'translate',
      text,
      sourceLanguage || 'auto',
      targetLanguage,
    );
    if (this.cache) {
      const cached = await this.cache.get<TranslationResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const [translation] = await this.client.translate(text, {
        from: sourceLanguage,
        to: targetLanguage,
      });

      // Detect if source language was auto-detected
      const detectedSourceLanguage = !sourceLanguage;

      // Get detected language if not provided
      let actualSourceLanguage = sourceLanguage;
      if (!actualSourceLanguage) {
        const [detection] = await this.client.detect(text);
        actualSourceLanguage = Array.isArray(detection)
          ? detection[0].language
          : detection.language;
      }

      const result: TranslationResult = {
        translatedText: translation,
        sourceText: text,
        sourceLanguage: actualSourceLanguage || 'unknown',
        targetLanguage,
        detectedSourceLanguage,
        raw: translation,
      };

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Detects the language of the provided text
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!isValidText(text)) {
      throw new InvalidTextError('Text cannot be empty', 'google');
    }

    // Check cache first
    const cacheKey = this.getCacheKey('detect', text);
    if (this.cache) {
      const cached = await this.cache.get<LanguageDetectionResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const [detections] = await this.client.detect(text);
      const detectionsArray = Array.isArray(detections)
        ? detections
        : [detections];

      if (detectionsArray.length === 0) {
        throw new TranslationError(
          'No language detected',
          'NO_DETECTION',
          'google',
        );
      }

      const primary = detectionsArray[0];

      const result: LanguageDetectionResult = {
        language: primary.language,
        confidence: normalizeConfidence(primary.confidence || 0),
        alternatives: detectionsArray.slice(1).map((d) => ({
          language: d.language,
          confidence: normalizeConfidence(d.confidence || 0),
        })),
        raw: detections,
      };

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }

  /**
   * Gets the list of languages supported by this provider
   */
  async getSupportedLanguages(): Promise<SupportedLanguage[]> {
    // Check cache first (this data rarely changes)
    const cacheKey = this.getCacheKey('languages');
    if (this.cache) {
      const cached = await this.cache.get<SupportedLanguage[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const [languages] = await this.client.getLanguages();

      const result = languages.map((lang) => ({
        code: lang.code,
        name: lang.name || getLanguageName(lang.code),
      }));

      // Cache for longer (24 hours) as language lists rarely change
      if (this.cache) {
        await this.cache.set(cacheKey, result, 86400);
      }

      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Translates multiple texts in a single batch operation
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const [translations] = await this.client.translate(texts, {
        from: sourceLanguage,
        to: targetLanguage,
      });

      const translationsArray = Array.isArray(translations)
        ? translations
        : [translations];

      const detectedSourceLanguage = !sourceLanguage;
      let actualSourceLanguage = sourceLanguage;

      // Detect source language for first text if not provided
      if (!actualSourceLanguage && texts.length > 0) {
        const [detection] = await this.client.detect(texts[0]);
        actualSourceLanguage = Array.isArray(detection)
          ? detection[0].language
          : detection.language;
      }

      return texts.map((text, index) => ({
        translatedText: translationsArray[index] || text,
        sourceText: text,
        sourceLanguage: actualSourceLanguage || 'unknown',
        targetLanguage,
        detectedSourceLanguage,
        raw: translationsArray[index],
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Maps Google Translate errors to standardized error types
   */
  private mapError(error: unknown): TranslationError {
    const err = error as any;

    // Check for common error codes
    if (err.code === 403 || err.code === 401) {
      return new AuthenticationError('google');
    }

    if (err.code === 429) {
      return new QuotaExceededError('google');
    }

    if (err.code === 400 && err.message?.includes('language')) {
      const match = err.message.match(/language[:\s]+([a-z-]+)/i);
      const language = match ? match[1] : 'unknown';
      return new UnsupportedLanguageError(language, 'google');
    }

    return new TranslationError(
      err.message || 'Translation failed',
      err.code || 'UNKNOWN_ERROR',
      'google',
    );
  }
}
