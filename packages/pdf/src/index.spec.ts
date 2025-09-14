import { it, expect, beforeAll, describe } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPDFReader, extractTextFromPDF, checkOCRDependencies } from './index.js';

describe('PDF Package Integration', () => {
  let reader: any = null;

  beforeAll(async () => {
    reader = await getPDFReader();
  });

  it('should create PDF reader and analyze document', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    // Get document info
    const info = await reader.getInfo(pdfPath);
    
    expect(info).toBeDefined();
    expect(typeof info.pageCount).toBe('number');
    expect(info.pageCount).toBeGreaterThan(0);
    expect(typeof info.hasEmbeddedText).toBe('boolean');
    expect(typeof info.hasImages).toBe('boolean');
    expect(['text', 'ocr', 'hybrid'].includes(info.recommendedStrategy)).toBe(true);
  }, 30000);

  it('should extract text using legacy function', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const text = await extractTextFromPDF(pdfPath);
    
    expect(text !== undefined).toBe(true);
    expect(typeof text === 'string' || text === null).toBe(true);
  }, 30000);

  it('should check OCR dependencies', async () => {
    const deps = await checkOCRDependencies();
    
    expect(deps).toHaveProperty('available');
    expect(typeof deps.available).toBe('boolean');
    expect(deps).toHaveProperty('details');
  });

  it('should handle OCR capability check', async () => {
    const capabilities = await reader.checkCapabilities();
    
    expect(capabilities).toHaveProperty('canPerformOCR');
    expect(typeof capabilities.canPerformOCR).toBe('boolean');
  });
});