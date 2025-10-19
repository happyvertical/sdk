import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getAvailableProviders,
  getPDFReader,
  getProviderInfo,
  isProviderAvailable,
} from './index';

describe('PDF Factory Tests', () => {
  it('should create a PDF reader with auto provider selection', async () => {
    const reader = await getPDFReader();
    expect(reader).toBeDefined();
    expect(typeof reader.extractText).toBe('function');
    expect(typeof reader.extractMetadata).toBe('function');
    expect(typeof reader.extractImages).toBe('function');
    expect(typeof reader.performOCR).toBe('function');
    expect(typeof reader.checkCapabilities).toBe('function');
    expect(typeof reader.checkDependencies).toBe('function');
  });

  it('should create a PDF reader with explicit unpdf provider', async () => {
    const reader = await getPDFReader({ provider: 'unpdf' });
    expect(reader).toBeDefined();
    expect(reader.constructor.name).toBe('CombinedNodeProvider');
  });

  it('should reject invalid provider for Node.js environment', async () => {
    await expect(getPDFReader({ provider: 'pdfjs' as any })).rejects.toThrow(
      'pdfjs provider is only available in browser environments',
    );
  });

  it('should return available providers for Node.js environment', () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers).toContain('unpdf');
    expect(providers).not.toContain('pdfjs'); // Not available in Node.js
  });

  it('should correctly report provider availability', () => {
    expect(isProviderAvailable('unpdf')).toBe(true);
    expect(isProviderAvailable('pdfjs')).toBe(false);
    expect(isProviderAvailable('nonexistent')).toBe(false);
  });

  it('should get provider information', async () => {
    const info = await getProviderInfo('unpdf');
    expect(info).toHaveProperty('provider', 'unpdf');
    expect(info).toHaveProperty('available', true);
    expect(info).toHaveProperty('capabilities');
    expect(info).toHaveProperty('dependencies');
    expect(info.capabilities).toHaveProperty('canExtractText');
    expect(info.dependencies).toHaveProperty('available');
  }, 60000); // 60 second timeout for OCR initialization

  it('should handle unknown provider gracefully', async () => {
    const info = await getProviderInfo('unknown');
    expect(info).toHaveProperty('provider', 'unknown');
    expect(info).toHaveProperty('available', false);
    expect(info).toHaveProperty('error');
    expect(info.capabilities).toBeNull();
    expect(info.dependencies).toBeNull();
  });

  it('should create reader with options', async () => {
    const reader = await getPDFReader({
      provider: 'auto',
      enableOCR: true,
      timeout: 120000,
      maxFileSize: 50 * 1024 * 1024, // 50MB
    });
    expect(reader).toBeDefined();
  });

  describe('Environment Variable Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment before each test
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should load enableOCR from HAVE_PDF_ENABLE_OCR environment variable', async () => {
      process.env.HAVE_PDF_ENABLE_OCR = 'true';
      const reader = await getPDFReader();
      expect(reader).toBeDefined();
      // Note: Reader doesn't expose config directly, but we verify it doesn't throw
    });

    it('should load timeout from HAVE_PDF_TIMEOUT environment variable', async () => {
      process.env.HAVE_PDF_TIMEOUT = '30000';
      const reader = await getPDFReader();
      expect(reader).toBeDefined();
    });

    it('should load provider from HAVE_PDF_PROVIDER environment variable', async () => {
      process.env.HAVE_PDF_PROVIDER = 'unpdf';
      const reader = await getPDFReader();
      expect(reader).toBeDefined();
      expect(reader.constructor.name).toBe('CombinedNodeProvider');
    });

    it('should load maxFileSize from HAVE_PDF_MAX_FILE_SIZE environment variable', async () => {
      process.env.HAVE_PDF_MAX_FILE_SIZE = '52428800'; // 50MB in bytes
      const reader = await getPDFReader();
      expect(reader).toBeDefined();
    });

    it('should allow user options to override environment variables', async () => {
      process.env.HAVE_PDF_PROVIDER = 'pdfjs';
      // User explicitly specifies unpdf, should override env var
      const reader = await getPDFReader({ provider: 'unpdf' });
      expect(reader).toBeDefined();
      expect(reader.constructor.name).toBe('CombinedNodeProvider');
    });

    it('should handle boolean environment variables correctly', async () => {
      // Test various boolean formats
      process.env.HAVE_PDF_ENABLE_OCR = '1';
      let reader = await getPDFReader();
      expect(reader).toBeDefined();

      process.env.HAVE_PDF_ENABLE_OCR = 'yes';
      reader = await getPDFReader();
      expect(reader).toBeDefined();

      process.env.HAVE_PDF_ENABLE_OCR = 'false';
      reader = await getPDFReader();
      expect(reader).toBeDefined();
    });

    it('should handle invalid number conversion gracefully', async () => {
      process.env.HAVE_PDF_TIMEOUT = 'not-a-number';
      // Should not throw, just use default or skip invalid value
      const reader = await getPDFReader();
      expect(reader).toBeDefined();
    });

    it('should combine multiple environment variables', async () => {
      process.env.HAVE_PDF_ENABLE_OCR = 'true';
      process.env.HAVE_PDF_TIMEOUT = '60000';
      process.env.HAVE_PDF_PROVIDER = 'unpdf';
      process.env.HAVE_PDF_MAX_FILE_SIZE = '104857600'; // 100MB

      const reader = await getPDFReader();
      expect(reader).toBeDefined();
      expect(reader.constructor.name).toBe('CombinedNodeProvider');
    });
  });
});
