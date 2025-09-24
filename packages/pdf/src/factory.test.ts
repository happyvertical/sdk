import { describe, expect, it } from 'vitest';
import {
  getAvailableProviders,
  getPDFReader,
  getProviderInfo,
  isProviderAvailable,
} from './index.js';

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
});
