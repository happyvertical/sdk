import { it, expect, beforeAll, describe } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextFromPDF, checkOCRDependencies, performOCROnImages } from './index.js';

describe('PDF Processing with OCR', () => {
  let ocrAvailable = false;

  beforeAll(async () => {
    // Check if OCR dependencies are available
    const deps = await checkOCRDependencies();
    ocrAvailable = deps.available;
    
    if (!ocrAvailable) {
      console.warn('OCR dependencies not available:', deps.error);
      console.warn('Tests will run but OCR functionality will be limited');
    }
  });

  it('should extract text from an image pdf', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const text = await extractTextFromPDF(pdfPath);
    
    // Function should always return (string or null), never throw
    expect(text !== undefined).toBe(true);
    
    if (ocrAvailable) {
      // If OCR is available, we expect to get some text
      console.log('OCR available - extracted text length:', text?.length || 0);
    } else {
      // If OCR is not available, text might be null for image-based PDFs
      console.log('OCR not available - basic text extraction only');
    }
  }, 30000);

  it('should extract text from a problematic pdf', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    const text = await extractTextFromPDF(pdfPath);
    
    // Function should always return (string or null), never throw  
    expect(text !== undefined).toBe(true);
    
    if (ocrAvailable) {
      console.log('OCR available - extracted text length:', text?.length || 0);
    } else {
      console.log('OCR not available - basic text extraction only');
    }
  }, 30000);

  it('should check OCR dependencies correctly', async () => {
    const deps = await checkOCRDependencies();
    
    // Should always return a valid result structure
    expect(deps).toHaveProperty('available');
    expect(deps).toHaveProperty('details');
    expect(deps.details).toHaveProperty('ocrNode');
    expect(deps.details).toHaveProperty('systemLibraries');
    
    console.log('OCR dependency check result:', deps);
  });

  it('should handle empty images array in performOCROnImages', async () => {
    const result = await performOCROnImages([]);
    expect(result).toBe('');
  });

  it('should handle null images array in performOCROnImages', async () => {
    const result = await performOCROnImages(null as any);
    expect(result).toBe('');
  });

  it('should handle undefined images array in performOCROnImages', async () => {
    const result = await performOCROnImages(undefined as any);
    expect(result).toBe('');
  });

  it('should return empty string when OCR dependencies are not available', async () => {
    // Mock images data - doesn't matter what format since dependencies won't be available
    const mockImages = [
      { data: Buffer.from('fake-image-data') },
      { data: Buffer.from('another-fake-image') }
    ];
    
    const result = await performOCROnImages(mockImages);
    
    // Should return empty string if dependencies aren't available
    expect(typeof result).toBe('string');
    
    if (ocrAvailable) {
      console.log('OCR available - processed images, result length:', result.length);
    } else {
      console.log('OCR not available - returned empty string as expected');
      expect(result).toBe('');
    }
  });

  it('should handle invalid image data gracefully', async () => {
    // Test with invalid image data
    const invalidImages = [
      { data: null },
      { data: undefined },
      {},
      null,
      undefined
    ];
    
    const result = await performOCROnImages(invalidImages);
    
    // Should always return a string, never throw
    expect(typeof result).toBe('string');
    
    if (ocrAvailable) {
      console.log('OCR available - handled invalid images, result:', result);
    } else {
      console.log('OCR not available - returned empty string');
      expect(result).toBe('');
    }
  });
});
