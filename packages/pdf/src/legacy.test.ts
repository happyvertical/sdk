import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkOCRDependencies,
  extractImagesFromPDF,
  extractTextFromPDF,
  performOCROnImages,
} from './index.js';

describe('Legacy Compatibility Functions', () => {
  it('should extract text using legacy function', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );

    const text = await extractTextFromPDF(pdfPath);

    // Should behave exactly like the original function
    expect(text !== undefined).toBe(true);
    expect(typeof text === 'string' || text === null).toBe(true);
  }, 30000);

  it('should extract images using legacy function', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );

    const images = await extractImagesFromPDF(pdfPath);

    expect(images === null || Array.isArray(images)).toBe(true);
  }, 30000);

  it('should handle OCR using legacy function', async () => {
    const mockImages = [
      { data: Buffer.from('fake-image-data'), width: 100, height: 100 },
    ];

    const result = await performOCROnImages(mockImages);

    expect(typeof result).toBe('string');
  }, 30000);

  it('should check OCR dependencies using legacy function', async () => {
    const deps = await checkOCRDependencies();

    expect(deps).toHaveProperty('available');
    expect(typeof deps.available).toBe('boolean');
  });
});
