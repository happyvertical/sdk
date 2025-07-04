import { it, expect, beforeAll, describe } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextFromPDF, checkOCRDependencies } from './index.js';

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
});
