/**
 * @happyvertical/ocr - Environment variable configuration tests
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getOCR, OCRFactory, resetOCRFactory } from './factory';

describe('OCRFactory environment variable configuration', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset factory before each test
    resetOCRFactory();
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
    // Reset factory after each test
    resetOCRFactory();
  });

  test('should load provider from HAVE_OCR_PROVIDER', () => {
    process.env.HAVE_OCR_PROVIDER = 'onnx';
    const factory = new OCRFactory();

    // Access private property via any cast for testing
    const primaryProvider = (factory as any).primaryProvider;
    expect(primaryProvider).toBe('onnx');
  });

  test('should load language from HAVE_OCR_LANGUAGE', () => {
    process.env.HAVE_OCR_LANGUAGE = 'eng+chi_sim';
    const factory = new OCRFactory();

    const defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.language).toBe('eng+chi_sim');
  });

  test('should load confidenceThreshold from HAVE_OCR_CONFIDENCE_THRESHOLD', () => {
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '85';
    const factory = new OCRFactory();

    const defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.confidenceThreshold).toBe(85);
  });

  test('should load timeout from HAVE_OCR_TIMEOUT', () => {
    process.env.HAVE_OCR_TIMEOUT = '45000';
    const factory = new OCRFactory();

    const defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.timeout).toBe(45000);
  });

  test('should load all environment variables together', () => {
    process.env.HAVE_OCR_PROVIDER = 'tesseract';
    process.env.HAVE_OCR_LANGUAGE = 'eng+jpn';
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '90';
    process.env.HAVE_OCR_TIMEOUT = '60000';

    const factory = new OCRFactory();

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    expect(primaryProvider).toBe('tesseract');
    expect(defaultOptions?.language).toBe('eng+jpn');
    expect(defaultOptions?.confidenceThreshold).toBe(90);
    expect(defaultOptions?.timeout).toBe(60000);
  });

  test('user options should take precedence over env vars', () => {
    process.env.HAVE_OCR_PROVIDER = 'onnx';
    process.env.HAVE_OCR_LANGUAGE = 'eng';
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '70';
    process.env.HAVE_OCR_TIMEOUT = '30000';

    const factory = new OCRFactory({
      provider: 'tesseract',
      defaultOptions: {
        language: 'jpn',
        confidenceThreshold: 95,
        timeout: 50000,
      },
    });

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    expect(primaryProvider).toBe('tesseract');
    expect(defaultOptions?.language).toBe('jpn');
    expect(defaultOptions?.confidenceThreshold).toBe(95);
    expect(defaultOptions?.timeout).toBe(50000);
  });

  test('partial user options should merge with env vars', () => {
    process.env.HAVE_OCR_PROVIDER = 'onnx';
    process.env.HAVE_OCR_LANGUAGE = 'eng';
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '80';
    process.env.HAVE_OCR_TIMEOUT = '40000';

    const factory = new OCRFactory({
      defaultOptions: {
        language: 'chi_sim', // Override only language
      },
    });

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    expect(primaryProvider).toBe('onnx'); // From env
    expect(defaultOptions?.language).toBe('chi_sim'); // From user
    expect(defaultOptions?.confidenceThreshold).toBe(80); // From env
    expect(defaultOptions?.timeout).toBe(40000); // From env
  });

  test('getOCR should use env vars for global singleton', () => {
    process.env.HAVE_OCR_PROVIDER = 'onnx';
    process.env.HAVE_OCR_LANGUAGE = 'eng+chi_sim';

    const factory = getOCR();

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    expect(primaryProvider).toBe('onnx');
    expect(defaultOptions?.language).toBe('eng+chi_sim');
  });

  test('getOCR with options should create new instance with those options', () => {
    process.env.HAVE_OCR_PROVIDER = 'onnx';
    process.env.HAVE_OCR_LANGUAGE = 'eng';

    const factory = getOCR({
      provider: 'tesseract',
      defaultOptions: { language: 'jpn' },
    });

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    expect(primaryProvider).toBe('tesseract');
    expect(defaultOptions?.language).toBe('jpn');
  });

  test('should handle invalid confidence threshold gracefully', () => {
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = 'not-a-number';

    // Should not throw, but log warning
    const factory = new OCRFactory();

    const defaultOptions = (factory as any).defaultOptions;
    // Invalid value should be skipped
    expect(defaultOptions?.confidenceThreshold).toBeUndefined();
  });

  test('should handle invalid timeout gracefully', () => {
    process.env.HAVE_OCR_TIMEOUT = 'invalid';

    // Should not throw, but log warning
    const factory = new OCRFactory();

    const defaultOptions = (factory as any).defaultOptions;
    // Invalid value should be skipped
    expect(defaultOptions?.timeout).toBeUndefined();
  });

  test('should default to auto provider when no env var set', () => {
    delete process.env.HAVE_OCR_PROVIDER;

    const factory = new OCRFactory();

    const primaryProvider = (factory as any).primaryProvider;
    expect(primaryProvider).toBe('auto');
  });

  test('should handle empty string env vars', () => {
    process.env.HAVE_OCR_PROVIDER = '';
    process.env.HAVE_OCR_LANGUAGE = '';

    const factory = new OCRFactory();

    const primaryProvider = (factory as any).primaryProvider;
    const defaultOptions = (factory as any).defaultOptions;

    // Empty string should default to 'auto' for provider
    expect(primaryProvider).toBe('auto');
    // Empty string for language is loaded as empty string by loadEnvConfig
    expect(defaultOptions?.language).toBe('');
  });

  test('should support all valid provider values', () => {
    const validProviders = ['auto', 'tesseract', 'onnx', 'web-ocr'];

    for (const provider of validProviders) {
      process.env.HAVE_OCR_PROVIDER = provider;
      const factory = new OCRFactory();
      const primaryProvider = (factory as any).primaryProvider;
      expect(primaryProvider).toBe(provider);
    }
  });

  test('should handle edge case confidence threshold values', () => {
    // Test minimum value
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '0';
    let factory = new OCRFactory();
    let defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.confidenceThreshold).toBe(0);

    // Test maximum value
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '100';
    factory = new OCRFactory();
    defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.confidenceThreshold).toBe(100);

    // Test negative value (should parse as number but may be filtered by provider)
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '-10';
    factory = new OCRFactory();
    defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.confidenceThreshold).toBe(-10);

    // Test value over 100 (should parse as number but may be clamped by provider)
    process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '150';
    factory = new OCRFactory();
    defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.confidenceThreshold).toBe(150);
  });

  test('should handle very large timeout values', () => {
    process.env.HAVE_OCR_TIMEOUT = '999999';
    const factory = new OCRFactory();
    const defaultOptions = (factory as any).defaultOptions;
    expect(defaultOptions?.timeout).toBe(999999);
  });

  test('should handle multi-language format in env var', () => {
    const multiLangFormats = [
      'eng+chi_sim',
      'eng+chi_sim+jpn',
      'eng+chi_sim+jpn+kor',
      'fra+deu+eng',
    ];

    for (const lang of multiLangFormats) {
      process.env.HAVE_OCR_LANGUAGE = lang;
      const factory = new OCRFactory();
      const defaultOptions = (factory as any).defaultOptions;
      expect(defaultOptions?.language).toBe(lang);
    }
  });
});
