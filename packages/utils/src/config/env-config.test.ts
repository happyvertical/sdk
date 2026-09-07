/**
 * Tests for environment variable configuration loader
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConfigOptions,
  convertType,
  loadEnvConfig,
  toCamelCase,
  toScreamingSnakeCase,
} from './env-config';

describe('toCamelCase', () => {
  it('converts snake_case to camelCase', () => {
    expect(toCamelCase('max_retries')).toBe('maxRetries');
    expect(toCamelCase('api_key')).toBe('apiKey');
    expect(toCamelCase('base_url')).toBe('baseUrl');
  });

  it('handles already camelCase strings', () => {
    expect(toCamelCase('maxRetries')).toBe('maxretries');
  });

  it('handles empty strings', () => {
    expect(toCamelCase('')).toBe('');
  });

  it('handles single words', () => {
    expect(toCamelCase('provider')).toBe('provider');
  });

  it('handles multiple underscores', () => {
    expect(toCamelCase('my_long_variable_name')).toBe('myLongVariableName');
  });
});

describe('toScreamingSnakeCase', () => {
  it('converts camelCase to SCREAMING_SNAKE_CASE', () => {
    expect(toScreamingSnakeCase('maxRetries')).toBe('MAX_RETRIES');
    expect(toScreamingSnakeCase('apiKey')).toBe('API_KEY');
    expect(toScreamingSnakeCase('baseUrl')).toBe('BASE_URL');
  });

  it('handles already SCREAMING_SNAKE_CASE strings', () => {
    expect(toScreamingSnakeCase('MAX_RETRIES')).toBe('M_A_X__R_E_T_R_I_E_S');
  });

  it('handles empty strings', () => {
    expect(toScreamingSnakeCase('')).toBe('');
  });

  it('handles single words', () => {
    expect(toScreamingSnakeCase('provider')).toBe('PROVIDER');
  });

  it('handles consecutive capitals', () => {
    expect(toScreamingSnakeCase('HTTPSConnection')).toBe(
      'H_T_T_P_S_CONNECTION',
    );
  });
});

describe('convertType', () => {
  describe('string type', () => {
    it('returns string as-is', () => {
      expect(convertType('hello', 'string')).toBe('hello');
      expect(convertType('123', 'string')).toBe('123');
      expect(convertType('true', 'string')).toBe('true');
    });
  });

  describe('number type', () => {
    it('converts valid numbers', () => {
      expect(convertType('123', 'number')).toBe(123);
      expect(convertType('0', 'number')).toBe(0);
      expect(convertType('-42', 'number')).toBe(-42);
      expect(convertType('3.14', 'number')).toBe(3.14);
    });

    it('throws on invalid numbers', () => {
      expect(() => convertType('abc', 'number')).toThrow(
        'Cannot convert "abc" to number',
      );
      // Note: empty string converts to 0, not NaN
    });
  });

  describe('boolean type', () => {
    it('converts true values', () => {
      expect(convertType('true', 'boolean')).toBe(true);
      expect(convertType('TRUE', 'boolean')).toBe(true);
      expect(convertType('True', 'boolean')).toBe(true);
      expect(convertType('1', 'boolean')).toBe(true);
      expect(convertType('yes', 'boolean')).toBe(true);
      expect(convertType('YES', 'boolean')).toBe(true);
    });

    it('converts false values', () => {
      expect(convertType('false', 'boolean')).toBe(false);
      expect(convertType('0', 'boolean')).toBe(false);
      expect(convertType('no', 'boolean')).toBe(false);
      expect(convertType('', 'boolean')).toBe(false);
      expect(convertType('anything', 'boolean')).toBe(false);
    });
  });

  describe('json type', () => {
    it('parses valid JSON', () => {
      expect(convertType('{"key":"value"}', 'json')).toEqual({ key: 'value' });
      expect(convertType('[1,2,3]', 'json')).toEqual([1, 2, 3]);
      expect(convertType('null', 'json')).toBeNull();
      expect(convertType('true', 'json')).toBe(true);
      expect(convertType('123', 'json')).toBe(123);
    });

    it('throws on invalid JSON', () => {
      expect(() => convertType('{invalid}', 'json')).toThrow(
        'Cannot parse "{invalid}" as JSON',
      );
      expect(() => convertType('undefined', 'json')).toThrow();
    });
  });
});

describe('loadEnvConfig', () => {
  // Store original env to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear env vars before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('HAVE_') || key.startsWith('TEST_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('basic functionality', () => {
    it('uses user options when process is unavailable in a browser', () => {
      const nodeProcess = globalThis.process;
      vi.stubGlobal('process', undefined);

      try {
        const config = loadEnvConfig(
          { level: 'warn' },
          {
            packageName: 'logger',
            schema: { level: 'string' },
          },
        );

        expect(config).toEqual({ level: 'warn' });
      } finally {
        vi.stubGlobal('process', nodeProcess);
      }
    });

    it('returns user options when no env vars set', () => {
      const config = loadEnvConfig(
        { provider: 'openai' },
        { packageName: 'ai' },
      );
      expect(config).toEqual({ provider: 'openai' });
    });

    it('loads env vars with HAVE prefix and package name', () => {
      process.env.HAVE_AI_PROVIDER = 'anthropic';
      process.env.HAVE_AI_MODEL = 'claude-3-5-sonnet-20241022';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
            model: 'string',
          },
        },
      );

      expect(config).toEqual({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      });
    });

    it('user options take precedence over env vars', () => {
      process.env.HAVE_AI_PROVIDER = 'anthropic';
      process.env.HAVE_AI_MODEL = 'claude-3-5-sonnet-20241022';

      const config = loadEnvConfig(
        { provider: 'openai' }, // User option overrides env
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
            model: 'string',
          },
        },
      );

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('converts snake_case env vars to camelCase fields', () => {
      process.env.HAVE_AI_MAX_RETRIES = '5';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            maxRetries: 'number',
          },
        },
      );

      expect(config.maxRetries).toBe(5);
    });
  });

  describe('custom prefix', () => {
    it('uses custom prefix instead of HAVE', () => {
      process.env.SQLOO_DATABASE = 'mydb';
      process.env.SQLOO_PORT = '5432';

      const config = loadEnvConfig(
        {},
        {
          prefix: 'SQLOO',
          schema: {
            database: 'string',
            port: 'number',
          },
          allowUnknown: false, // Only load schema-defined fields
        },
      );

      expect(config).toEqual({
        database: 'mydb',
        port: 5432,
      });
    });

    it('uses no prefix when empty string provided', () => {
      process.env.DATABASE = 'mydb';
      process.env.PORT = '5432';

      const config = loadEnvConfig(
        {},
        {
          prefix: '',
          schema: {
            DATABASE: 'string',
            PORT: 'number',
          },
        },
      );

      expect(config).toEqual({
        DATABASE: 'mydb',
        PORT: 5432,
      });
    });

    it('combines custom prefix with package name', () => {
      process.env.CUSTOM_SQL_TYPE = 'postgres';

      const config = loadEnvConfig(
        {},
        {
          prefix: 'CUSTOM',
          packageName: 'sql',
          schema: {
            type: 'string',
          },
        },
      );

      expect(config.type).toBe('postgres');
    });
  });

  describe('type conversion', () => {
    it('converts types based on schema', () => {
      process.env.HAVE_AI_PROVIDER = 'openai';
      process.env.HAVE_AI_TIMEOUT = '30000';
      process.env.HAVE_AI_ENABLE_CACHE = 'true';
      process.env.HAVE_AI_OPTIONS = '{"key":"value"}';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
            timeout: 'number',
            enableCache: 'boolean',
            options: 'json',
          },
        },
      );

      expect(config.provider).toBe('openai');
      expect(config.timeout).toBe(30000);
      expect(config.enableCache).toBe(true);
      expect(config.options).toEqual({ key: 'value' });
    });

    it('defaults to string when no schema provided', () => {
      process.env.HAVE_AI_CUSTOM_FIELD = '123';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          allowUnknown: true,
        },
      );

      expect(config.customField).toBe('123'); // String, not number
    });

    it('warns on type conversion failures', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      process.env.HAVE_AI_TIMEOUT = 'invalid';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            timeout: 'number',
          },
        },
      );

      expect(config.timeout).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to convert'),
        expect.any(String),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('transform functions', () => {
    it('applies custom transform functions', () => {
      process.env.HAVE_AI_MODELS = 'gpt-4,claude-3,gemini-pro';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          transform: {
            models: (value: string) => value.split(','),
          },
        },
      );

      expect(config.models).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);
    });

    it('transform takes precedence over schema', () => {
      process.env.HAVE_AI_PORT = '8080';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            port: 'string', // Schema says string
          },
          transform: {
            port: (value: string) => Number.parseInt(value, 10), // Transform to number
          },
        },
      );

      expect(config.port).toBe(8080);
      expect(typeof config.port).toBe('number');
    });

    it('warns on transform failures', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      process.env.HAVE_AI_CONFIG = 'invalid-json';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          transform: {
            config: (value: string) => JSON.parse(value), // Will throw
          },
        },
      );

      expect(config.config).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to transform'),
        expect.any(String),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('allowUnknown option', () => {
    it('loads env vars not in schema when allowUnknown is true', () => {
      process.env.HAVE_AI_PROVIDER = 'openai';
      process.env.HAVE_AI_CUSTOM_FIELD = 'custom-value';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
          },
          allowUnknown: true,
        },
      );

      expect(config.provider).toBe('openai');
      expect(config.customField).toBe('custom-value');
    });

    it('ignores env vars not in schema when allowUnknown is false', () => {
      process.env.HAVE_AI_PROVIDER = 'openai';
      process.env.HAVE_AI_CUSTOM_FIELD = 'custom-value';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
          },
          allowUnknown: false,
        },
      );

      expect(config.provider).toBe('openai');
      expect(config.customField).toBeUndefined();
    });
  });

  describe('real-world scenarios', () => {
    it('handles AI package configuration', () => {
      process.env.HAVE_AI_PROVIDER = 'claude-cli';
      process.env.HAVE_AI_MODEL = 'sonnet';
      process.env.HAVE_AI_TIMEOUT = '60000';
      process.env.HAVE_AI_MAX_RETRIES = '5';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
            model: 'string',
            timeout: 'number',
            maxRetries: 'number',
          },
        },
      );

      expect(config).toEqual({
        provider: 'claude-cli',
        model: 'sonnet',
        timeout: 60000,
        maxRetries: 5,
      });
    });

    it('handles SQL package configuration with backward compatibility', () => {
      // New HAVE_SQL_* vars
      process.env.HAVE_SQL_TYPE = 'postgres';
      process.env.HAVE_SQL_HOST = 'localhost';
      process.env.HAVE_SQL_PORT = '5432';

      const haveConfig = loadEnvConfig(
        {},
        {
          packageName: 'sql',
          schema: {
            type: 'string',
            host: 'string',
            port: 'number',
          },
        },
      );

      expect(haveConfig).toEqual({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
      });

      // Legacy SQLOO_* vars
      delete process.env.HAVE_SQL_TYPE;
      delete process.env.HAVE_SQL_HOST;
      delete process.env.HAVE_SQL_PORT;

      process.env.SQLOO_DATABASE = 'mydb';
      process.env.SQLOO_HOST = 'db.example.com';
      process.env.SQLOO_PORT = '5433';

      const sqlooConfig = loadEnvConfig(
        {},
        {
          prefix: 'SQLOO',
          schema: {
            database: 'string',
            host: 'string',
            port: 'number',
          },
          allowUnknown: false, // Only load schema-defined fields
        },
      );

      expect(sqlooConfig).toEqual({
        database: 'mydb',
        host: 'db.example.com',
        port: 5433,
      });
    });

    it('handles logger package configuration', () => {
      process.env.HAVE_LOGGER_LEVEL = 'debug';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'logger',
          schema: {
            level: 'string',
          },
        },
      );

      expect(config.level).toBe('debug');
    });

    it('handles OCR package configuration', () => {
      process.env.HAVE_OCR_PROVIDER = 'onnx';
      process.env.HAVE_OCR_LANGUAGE = 'eng+chi_sim';
      process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '85';
      process.env.HAVE_OCR_TIMEOUT = '45000';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ocr',
          schema: {
            provider: 'string',
            language: 'string',
            confidenceThreshold: 'number',
            timeout: 'number',
          },
        },
      );

      expect(config).toEqual({
        provider: 'onnx',
        language: 'eng+chi_sim',
        confidenceThreshold: 85,
        timeout: 45000,
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty string env var values', () => {
      process.env.HAVE_AI_PROVIDER = '';

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
          },
        },
      );

      expect(config.provider).toBe('');
    });

    it('handles undefined env vars correctly', () => {
      // Undefined env vars should not be added to config
      delete process.env.HAVE_AI_PROVIDER;

      const config = loadEnvConfig(
        {},
        {
          packageName: 'ai',
          schema: {
            provider: 'string',
          },
        },
      );

      // undefined env vars should not be in config
      expect(config.provider).toBeUndefined();
    });

    it('handles multiple packages with same prefix', () => {
      process.env.HAVE_AI_PROVIDER = 'openai';
      process.env.HAVE_SQL_TYPE = 'postgres';
      process.env.HAVE_LOGGER_LEVEL = 'info';

      const aiConfig = loadEnvConfig(
        {},
        { packageName: 'ai', schema: { provider: 'string' } },
      );
      const sqlConfig = loadEnvConfig(
        {},
        { packageName: 'sql', schema: { type: 'string' } },
      );
      const loggerConfig = loadEnvConfig(
        {},
        { packageName: 'logger', schema: { level: 'string' } },
      );

      expect(aiConfig.provider).toBe('openai');
      expect(sqlConfig.type).toBe('postgres');
      expect(loggerConfig.level).toBe('info');
    });
  });
});
