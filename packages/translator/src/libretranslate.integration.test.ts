/**
 * Integration tests for LibreTranslate provider
 * Uses public LibreTranslate instance
 */

import { describe, expect, it } from 'vitest';
import { getTranslator } from './index';

describe('LibreTranslate Provider Integration', () => {
  describe('translate', () => {
    // Skip by default - run with RUN_INTEGRATION_TESTS=true
    // LibreTranslate public instance has reliability issues
    it.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
      'should translate from English to Spanish',
      async () => {
        const translator = await getTranslator({
          provider: 'libretranslate',
        });

        const result = await translator.translate('Hello, world!', 'es', 'en');

        expect(result.translatedText).toBeDefined();
        expect(result.sourceLanguage).toBe('en');
        expect(result.targetLanguage).toBe('es');
        expect(result.sourceText).toBe('Hello, world!');
      },
      30000,
    );

    // Skip by default - run with RUN_INTEGRATION_TESTS=true
    it.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
      'should auto-detect source language',
      async () => {
        const translator = await getTranslator({
          provider: 'libretranslate',
        });

        const result = await translator.translate('Hola', 'en');

        expect(result.translatedText).toBeDefined();
        expect(result.detectedSourceLanguage).toBe(true);
        expect(result.targetLanguage).toBe('en');
      },
      30000,
    );
  });

  describe('templateFunction', () => {
    // Skip by default - run with RUN_INTEGRATION_TESTS=true
    it.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
      'should create a reusable translation function',
      async () => {
        const translator = await getTranslator({
          provider: 'libretranslate',
        });

        const translate = translator.templateFunction('en', 'es');

        const greeting = await translate('Hello');
        const farewell = await translate('Goodbye');

        expect(greeting).toBeDefined();
        expect(typeof greeting).toBe('string');
        expect(farewell).toBeDefined();
        expect(typeof farewell).toBe('string');
      },
      60000,
    );

    // Skip by default - run with RUN_INTEGRATION_TESTS=true
    it.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
      'should use default target language (en)',
      async () => {
        const translator = await getTranslator({
          provider: 'libretranslate',
        });

        const translate = translator.templateFunction('es');

        const result = await translate('Hola');

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      },
      30000,
    );
  });

  describe('getSupportedLanguages', () => {
    it('should return supported languages', async () => {
      const translator = await getTranslator({
        provider: 'libretranslate',
      });

      const languages = await translator.getSupportedLanguages();

      expect(languages).toBeDefined();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);

      const english = languages.find((l) => l.code === 'en');
      expect(english).toBeDefined();
      expect(english?.name).toBeDefined();
    }, 30000);
  });
});
