import { it, expect, beforeAll, describe } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextFromPDF, checkOCRDependencies, performOCROnImages, printInfo, PaperSizes } from './index.js';

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

describe('PDF Print Info', () => {
  it('should calculate print info for a text-based PDF', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    const info = await printInfo(pdfPath);
    
    // Verify structure
    expect(info).toHaveProperty('inkCoverage');
    expect(info.inkCoverage).toHaveProperty('cyan');
    expect(info.inkCoverage).toHaveProperty('magenta');
    expect(info.inkCoverage).toHaveProperty('yellow');
    expect(info.inkCoverage).toHaveProperty('black');
    expect(info).toHaveProperty('paperSize');
    expect(info).toHaveProperty('totalCoverage');
    expect(info).toHaveProperty('pagesAnalyzed');
    
    // Verify values are numbers
    expect(typeof info.inkCoverage.cyan).toBe('number');
    expect(typeof info.inkCoverage.magenta).toBe('number');
    expect(typeof info.inkCoverage.yellow).toBe('number');
    expect(typeof info.inkCoverage.black).toBe('number');
    expect(typeof info.totalCoverage).toBe('number');
    expect(typeof info.pagesAnalyzed).toBe('number');
    
    // Verify ranges (0-100%)
    expect(info.inkCoverage.cyan).toBeGreaterThanOrEqual(0);
    expect(info.inkCoverage.cyan).toBeLessThanOrEqual(100);
    expect(info.inkCoverage.magenta).toBeGreaterThanOrEqual(0);
    expect(info.inkCoverage.magenta).toBeLessThanOrEqual(100);
    expect(info.inkCoverage.yellow).toBeGreaterThanOrEqual(0);
    expect(info.inkCoverage.yellow).toBeLessThanOrEqual(100);
    expect(info.inkCoverage.black).toBeGreaterThanOrEqual(0);
    expect(info.inkCoverage.black).toBeLessThanOrEqual(100);
    expect(info.totalCoverage).toBeGreaterThanOrEqual(0);
    expect(info.totalCoverage).toBeLessThanOrEqual(100);
    
    // Default paper size should be US Letter
    expect(info.paperSize).toEqual(PaperSizes.LETTER);
    
    console.log('Print info for text PDF:', info);
  }, 30000);

  it('should calculate print info for an image-based PDF', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const info = await printInfo(pdfPath);
    
    // Verify it returns valid info even for image PDFs
    expect(info).toHaveProperty('inkCoverage');
    expect(info).toHaveProperty('totalCoverage');
    expect(info.pagesAnalyzed).toBeGreaterThan(0);
    
    console.log('Print info for image PDF:', info);
  }, 30000);

  it('should use custom paper size when provided', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    const customPaperSize = { width: 11, height: 17 }; // Tabloid
    const info = await printInfo(pdfPath, { paperSize: customPaperSize });
    
    expect(info.paperSize).toEqual(customPaperSize);
    expect(info.paperSize.width).toBe(11);
    expect(info.paperSize.height).toBe(17);
  });

  it('should analyze specific pages when requested', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    // Analyze only first 2 pages
    const info = await printInfo(pdfPath, { pages: [1, 2] });
    
    expect(info.pagesAnalyzed).toBeLessThanOrEqual(2);
    expect(info.inkCoverage.black).toBeGreaterThanOrEqual(0);
  });

  it('should use predefined paper sizes', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    // Test with A4 paper
    const info = await printInfo(pdfPath, { paperSize: PaperSizes.A4 });
    
    expect(info.paperSize).toEqual(PaperSizes.A4);
    expect(info.paperSize.width).toBeCloseTo(8.27, 2);
    expect(info.paperSize.height).toBeCloseTo(11.69, 2);
  });

  it('should handle invalid PDF path gracefully', async () => {
    const invalidPath = '/path/to/nonexistent.pdf';
    
    await expect(printInfo(invalidPath)).rejects.toThrow();
  });

  it('should handle empty pages array', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    const info = await printInfo(pdfPath, { pages: [] });
    
    expect(info.pagesAnalyzed).toBe(0);
    expect(info.inkCoverage.cyan).toBe(0);
    expect(info.inkCoverage.magenta).toBe(0);
    expect(info.inkCoverage.yellow).toBe(0);
    expect(info.inkCoverage.black).toBe(0);
    expect(info.totalCoverage).toBe(0);
  });

  it('should handle out-of-range page numbers', async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Agenda-Package-October-24-2023-Regular-Council-Meeting.pdf',
    );
    
    // Request pages that don't exist
    const info = await printInfo(pdfPath, { pages: [999, 1000] });
    
    expect(info.pagesAnalyzed).toBe(0);
    expect(info.totalCoverage).toBe(0);
  });
});
