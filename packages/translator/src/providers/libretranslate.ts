/**
 * LibreTranslate provider implementation
 */

import type {
  ITranslationProvider,
  LanguageDetectionResult,
  LibreTranslateOptions,
  SupportedLanguage,
  TranslationResult,
} from '../shared/types';
import {
  AuthenticationError,
  InvalidTextError,
  TranslationError,
  UnsupportedLanguageError,
} from '../shared/types';
import { getLanguageName, isValidText } from '../shared/utils';

/**
 * LibreTranslate API response structures
 */
interface LibreTranslateTranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    confidence: number;
    language: string;
  };
}

interface LibreTranslateDetectResponse {
  confidence: number;
  language: string;
}

interface LibreTranslateLanguage {
  code: string;
  name: string;
}

/**
 * LibreTranslate provider implementation
 */
export class LibreTranslateProvider implements ITranslationProvider {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(options: LibreTranslateOptions) {
    this.baseUrl = options.apiUrl || 'https://libretranslate.com';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
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
      throw new InvalidTextError('Text cannot be empty', 'libretranslate');
    }

    try {
      const body: any = {
        q: text,
        target: targetLanguage,
        format: 'text',
      };

      if (sourceLanguage) {
        body.source = sourceLanguage;
      } else {
        body.source = 'auto';
      }

      if (this.apiKey) {
        body.api_key = this.apiKey;
      }

      const response = await this.fetchLibreTranslate('/translate', body);

      const data = response as LibreTranslateTranslateResponse;

      return {
        translatedText: data.translatedText,
        sourceText: text,
        sourceLanguage:
          data.detectedLanguage?.language || sourceLanguage || 'unknown',
        targetLanguage,
        confidence: data.detectedLanguage?.confidence,
        detectedSourceLanguage: !sourceLanguage,
        raw: data,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Detects the language of the provided text
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!isValidText(text)) {
      throw new InvalidTextError('Text cannot be empty', 'libretranslate');
    }

    try {
      const body: any = {
        q: text,
      };

      if (this.apiKey) {
        body.api_key = this.apiKey;
      }

      const response = await this.fetchLibreTranslate('/detect', body);

      if (Array.isArray(response)) {
        const detections = response as LibreTranslateDetectResponse[];

        if (detections.length === 0) {
          throw new TranslationError(
            'No language detected',
            'NO_DETECTION',
            'libretranslate',
          );
        }

        return {
          language: detections[0].language,
          confidence: detections[0].confidence,
          alternatives: detections.slice(1).map((d) => ({
            language: d.language,
            confidence: d.confidence,
          })),
          raw: response,
        };
      }

      throw new TranslationError(
        'Invalid detection response',
        'INVALID_RESPONSE',
        'libretranslate',
      );
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
    try {
      const response = await this.fetchLibreTranslate(
        '/languages',
        undefined,
        'GET',
      );

      if (Array.isArray(response)) {
        const languages = response as LibreTranslateLanguage[];
        return languages.map((lang) => ({
          code: lang.code,
          name: lang.name || getLanguageName(lang.code),
        }));
      }

      throw new TranslationError(
        'Invalid languages response',
        'INVALID_RESPONSE',
        'libretranslate',
      );
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }

  /**
   * Translates multiple texts in a single batch operation
   * Note: LibreTranslate doesn't have native batch support,
   * so we translate texts sequentially
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    // Translate each text sequentially
    const results: TranslationResult[] = [];
    for (const text of texts) {
      const result = await this.translate(text, targetLanguage, sourceLanguage);
      results.push(result);
    }

    return results;
  }

  /**
   * Makes an HTTP request to LibreTranslate API
   */
  private async fetchLibreTranslate(
    endpoint: string,
    body?: any,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options: RequestInit = {
        method,
        signal: controller.signal,
      };

      if (method === 'POST' && body) {
        options.headers = {
          'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError('libretranslate');
        }

        if (response.status === 400) {
          const errorData = (await response.json().catch(() => ({}))) as any;
          if (errorData.error?.includes('language')) {
            throw new UnsupportedLanguageError(
              body.source || body.target || 'unknown',
              'libretranslate',
            );
          }
        }

        throw new TranslationError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
          'libretranslate',
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof TranslationError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new TranslationError(
          'Request timeout',
          'TIMEOUT',
          'libretranslate',
        );
      }

      throw error;
    }
  }

  /**
   * Maps LibreTranslate errors to standardized error types
   */
  private mapError(error: unknown): TranslationError {
    if (error instanceof TranslationError) {
      return error;
    }

    const err = error as any;
    return new TranslationError(
      err?.message || 'Translation failed',
      err?.code || 'UNKNOWN_ERROR',
      'libretranslate',
    );
  }
}
