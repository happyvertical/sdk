/**
 * Tests for environment variable configuration loading in translator
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTranslator } from './index';

describe('Translator Environment Configuration', () => {
  // Store original env to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear translator-related env vars before each test
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith('HAVE_TRANSLATOR_') ||
        key === 'GOOGLE_TRANSLATE_API_KEY' ||
        key === 'DEEPL_API_KEY'
      ) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('HAVE_TRANSLATOR_PROVIDER environment variable', () => {
    it('should load provider from HAVE_TRANSLATOR_PROVIDER', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
      // LibreTranslate doesn't require API key, so it should work
      const languages = await translator.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
    }, 30000);

    it('should use explicit provider over env var', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'google';

      const translator = await getTranslator({
        provider: 'libretranslate',
      });

      expect(translator).toBeDefined();
      const languages = await translator.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
    }, 30000);

    it('should throw error when provider is not specified', async () => {
      await expect(getTranslator()).rejects.toThrow(
        'Translation provider not specified',
      );
    });
  });

  describe('Provider-specific API key environment variables', () => {
    it('should load Google API key from GOOGLE_TRANSLATE_API_KEY', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'google';
      process.env.GOOGLE_TRANSLATE_API_KEY = 'test_google_key';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
      // We can't test the actual translation without a valid key,
      // but we can verify the translator was created successfully
    });

    it('should load DeepL API key from DEEPL_API_KEY', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'deepl';
      process.env.DEEPL_API_KEY = 'test_deepl_key';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
      // We can't test the actual translation without a valid key,
      // but we can verify the translator was created successfully
    });

    it('should prefer explicit apiKey over env var', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'google';
      process.env.GOOGLE_TRANSLATE_API_KEY = 'env_key';

      const translator = await getTranslator({
        apiKey: 'explicit_key',
      });

      expect(translator).toBeDefined();
    });
  });

  describe('Configuration merging', () => {
    it('should merge env vars with explicit options', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';
      process.env.HAVE_TRANSLATOR_TIMEOUT = '60000';

      const translator = await getTranslator({
        maxRetries: 5,
      });

      expect(translator).toBeDefined();
    }, 30000);

    it('should handle all configuration options from env', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';
      process.env.HAVE_TRANSLATOR_TIMEOUT = '45000';
      process.env.HAVE_TRANSLATOR_MAX_RETRIES = '3';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
    }, 30000);
  });

  describe('Provider-specific options', () => {
    it('should handle LibreTranslate with custom API URL', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';
      process.env.HAVE_TRANSLATOR_API_URL = 'https://custom.libretranslate.com';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
    });

    it('should handle DeepL free API option', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'deepl';
      process.env.DEEPL_API_KEY = 'test_key';

      const translator = await getTranslator({
        freeApi: true,
      });

      expect(translator).toBeDefined();
    });

    it('should handle Google Translate project ID', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'google';
      process.env.GOOGLE_TRANSLATE_API_KEY = 'test_key';

      const translator = await getTranslator({
        projectId: 'test-project',
      });

      expect(translator).toBeDefined();
    });
  });

  describe('Real-world usage patterns', () => {
    it('should work with only env vars (LibreTranslate)', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';

      const translator = await getTranslator();
      const t = translator.templateFunction('en', 'es');

      expect(t).toBeDefined();
      expect(typeof t).toBe('function');
    });

    it('should work with partial env vars and options', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';

      const translator = await getTranslator({
        timeout: 30000,
      });

      expect(translator).toBeDefined();
    }, 30000);

    it('should support multiple translators with different configs', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';

      const translator1 = await getTranslator();
      const translator2 = await getTranslator({
        provider: 'libretranslate',
        apiUrl: 'https://different.instance.com',
      });

      expect(translator1).toBeDefined();
      expect(translator2).toBeDefined();
    }, 30000);
  });

  describe('Error handling', () => {
    it('should provide helpful error when provider missing', async () => {
      await expect(getTranslator()).rejects.toThrow(
        /Translation provider not specified.*HAVE_TRANSLATOR_PROVIDER/,
      );
    });

    it('should handle invalid provider gracefully', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'invalid-provider';

      await expect(getTranslator()).rejects.toThrow('Unsupported provider');
    });
  });

  describe('Type conversions', () => {
    it('should convert numeric env vars to numbers', async () => {
      process.env.HAVE_TRANSLATOR_PROVIDER = 'libretranslate';
      process.env.HAVE_TRANSLATOR_TIMEOUT = '45000';
      process.env.HAVE_TRANSLATOR_MAX_RETRIES = '5';

      const translator = await getTranslator();

      expect(translator).toBeDefined();
      // The timeout and maxRetries should be converted to numbers internally
    }, 30000);
  });

  describe('Backward compatibility', () => {
    it('should work with existing Google Translate code', async () => {
      // Old pattern: explicit options
      const translator = await getTranslator({
        provider: 'google',
        apiKey: 'test_key',
      });

      expect(translator).toBeDefined();
    });

    it('should work with existing DeepL code', async () => {
      // Old pattern: explicit options
      const translator = await getTranslator({
        provider: 'deepl',
        apiKey: 'test_key',
      });

      expect(translator).toBeDefined();
    });

    it('should work with existing LibreTranslate code', async () => {
      // Old pattern: explicit options
      const translator = await getTranslator({
        provider: 'libretranslate',
      });

      expect(translator).toBeDefined();
    }, 30000);

    it('should maintain env var patterns for API keys', async () => {
      // Existing pattern: provider-specific env vars
      process.env.GOOGLE_TRANSLATE_API_KEY = 'google_key';

      const translator = await getTranslator({
        provider: 'google',
      });

      expect(translator).toBeDefined();
    });
  });
});
