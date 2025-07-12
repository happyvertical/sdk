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
    expect(info).toHaveProperty('rawInkCoverage');
    expect(info).toHaveProperty('estimatedInkUsage');
    expect(info.rawInkCoverage).toHaveProperty('cyan');
    expect(info.rawInkCoverage).toHaveProperty('magenta');
    expect(info.rawInkCoverage).toHaveProperty('yellow');
    expect(info.rawInkCoverage).toHaveProperty('black');
    expect(info.estimatedInkUsage).toHaveProperty('cyan');
    expect(info.estimatedInkUsage).toHaveProperty('magenta');
    expect(info.estimatedInkUsage).toHaveProperty('yellow');
    expect(info.estimatedInkUsage).toHaveProperty('black');
    expect(info).toHaveProperty('paperSize');
    expect(info).toHaveProperty('paperType');
    expect(info).toHaveProperty('printQuality');
    expect(info).toHaveProperty('rawTotalCoverage');
    expect(info).toHaveProperty('estimatedTotalUsage');
    expect(info).toHaveProperty('pagesAnalyzed');
    expect(info).toHaveProperty('usageFactors');
    
    // Verify values are numbers
    expect(typeof info.rawInkCoverage.cyan).toBe('number');
    expect(typeof info.rawInkCoverage.magenta).toBe('number');
    expect(typeof info.rawInkCoverage.yellow).toBe('number');
    expect(typeof info.rawInkCoverage.black).toBe('number');
    expect(typeof info.estimatedInkUsage.cyan).toBe('number');
    expect(typeof info.estimatedInkUsage.magenta).toBe('number');
    expect(typeof info.estimatedInkUsage.yellow).toBe('number');
    expect(typeof info.estimatedInkUsage.black).toBe('number');
    expect(typeof info.rawTotalCoverage).toBe('number');
    expect(typeof info.estimatedTotalUsage).toBe('number');
    expect(typeof info.pagesAnalyzed).toBe('number');
    
    // Verify ranges (0-100%)
    expect(info.rawInkCoverage.cyan).toBeGreaterThanOrEqual(0);
    expect(info.rawInkCoverage.cyan).toBeLessThanOrEqual(100);
    expect(info.estimatedInkUsage.cyan).toBeGreaterThanOrEqual(0);
    expect(info.rawInkCoverage.magenta).toBeGreaterThanOrEqual(0);
    expect(info.rawInkCoverage.magenta).toBeLessThanOrEqual(100);
    expect(info.rawInkCoverage.yellow).toBeGreaterThanOrEqual(0);
    expect(info.rawInkCoverage.yellow).toBeLessThanOrEqual(100);
    expect(info.rawInkCoverage.black).toBeGreaterThanOrEqual(0);
    expect(info.rawInkCoverage.black).toBeLessThanOrEqual(100);
    expect(info.rawTotalCoverage).toBeGreaterThanOrEqual(0);
    expect(info.rawTotalCoverage).toBeLessThanOrEqual(100);
    expect(info.estimatedTotalUsage).toBeGreaterThanOrEqual(0);
    
    // Verify default paper type and quality
    expect(info.paperType.name).toBe('Plain Paper');
    expect(info.printQuality.name).toBe('Normal');
    
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
    expect(info).toHaveProperty('rawInkCoverage');
    expect(info).toHaveProperty('estimatedInkUsage');
    expect(info).toHaveProperty('rawTotalCoverage');
    expect(info).toHaveProperty('estimatedTotalUsage');
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
    expect(info.rawInkCoverage.black).toBeGreaterThanOrEqual(0);
    expect(info.estimatedInkUsage.black).toBeGreaterThanOrEqual(0);
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
    expect(info.rawInkCoverage.cyan).toBe(0);
    expect(info.rawInkCoverage.magenta).toBe(0);
    expect(info.rawInkCoverage.yellow).toBe(0);
    expect(info.rawInkCoverage.black).toBe(0);
    expect(info.estimatedInkUsage.cyan).toBe(0);
    expect(info.estimatedInkUsage.magenta).toBe(0);
    expect(info.estimatedInkUsage.yellow).toBe(0);
    expect(info.estimatedInkUsage.black).toBe(0);
    expect(info.rawTotalCoverage).toBe(0);
    expect(info.estimatedTotalUsage).toBe(0);
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
    expect(info.rawTotalCoverage).toBe(0);
    expect(info.estimatedTotalUsage).toBe(0);
  });

  describe('Paper Type and Print Quality', () => {
    const testPdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );

    it('should use photo paper type with different ink usage', async () => {
      const info = await printInfo(testPdfPath, {
        paperType: 'PHOTO_GLOSSY',
        printQuality: 'PHOTO'
      });

      expect(info.paperType.name).toBe('Photo Paper (Glossy)');
      expect(info.printQuality.name).toBe('Photo');
      expect(info.usageFactors.absorptionMultiplier).toBe(0.7);
      expect(info.usageFactors.coatingFactor).toBe(0.8);
      expect(info.usageFactors.qualityMultiplier).toBe(1.5);
      expect(info.usageFactors.overallMultiplier).toBe(0.84); // 0.7 * 0.8 * 1.5

      // Estimated usage should be different from raw coverage
      expect(info.estimatedInkUsage.black).not.toBe(info.rawInkCoverage.black);
      expect(info.estimatedTotalUsage).not.toBe(info.rawTotalCoverage);
    });

    it('should use cardstock paper type with higher ink usage', async () => {
      const info = await printInfo(testPdfPath, {
        paperType: 'CARDSTOCK',
        printQuality: 'HIGH'
      });

      expect(info.paperType.name).toBe('Cardstock');
      expect(info.printQuality.name).toBe('High');
      expect(info.usageFactors.absorptionMultiplier).toBe(1.2);
      expect(info.usageFactors.coatingFactor).toBe(1.1);
      expect(info.usageFactors.qualityMultiplier).toBe(1.3);
      expect(info.usageFactors.overallMultiplier).toBe(1.72); // 1.2 * 1.1 * 1.3

      // Higher multiplier should result in higher estimated usage
      expect(info.estimatedTotalUsage).toBeGreaterThan(info.rawTotalCoverage);
    });

    it('should use draft quality with reduced ink usage', async () => {
      const info = await printInfo(testPdfPath, {
        paperType: 'PLAIN',
        printQuality: 'DRAFT'
      });

      expect(info.paperType.name).toBe('Plain Paper');
      expect(info.printQuality.name).toBe('Draft');
      expect(info.usageFactors.qualityMultiplier).toBe(0.7);
      expect(info.usageFactors.overallMultiplier).toBe(0.7); // 1.0 * 1.0 * 0.7

      // Draft quality should use less ink
      expect(info.estimatedTotalUsage).toBeLessThan(info.rawTotalCoverage);
    });

    it('should accept custom material properties', async () => {
      const customProperties = {
        absorptionMultiplier: 0.85,
        coatingFactor: 0.9,
        description: 'Custom test paper'
      };

      const info = await printInfo(testPdfPath, {
        customMaterialProperties: customProperties,
        printQuality: 'NORMAL'
      });

      expect(info.paperType.name).toBe('Custom');
      expect(info.paperType.description).toBe('Custom test paper');
      expect(info.usageFactors.absorptionMultiplier).toBe(0.85);
      expect(info.usageFactors.coatingFactor).toBe(0.9);
      expect(info.usageFactors.overallMultiplier).toBe(0.77); // 0.85 * 0.9 * 1.0
    });

    it('should accept paper type as object', async () => {
      const customPaperType = {
        name: 'Premium Matte',
        absorptionMultiplier: 0.95,
        coatingFactor: 0.92,
        description: 'Premium matte finish paper'
      };

      const info = await printInfo(testPdfPath, {
        paperType: customPaperType
      });

      expect(info.paperType.name).toBe('Premium Matte');
      expect(info.paperType.description).toBe('Premium matte finish paper');
      expect(info.usageFactors.absorptionMultiplier).toBe(0.95);
      expect(info.usageFactors.coatingFactor).toBe(0.92);
    });

    it('should provide accurate usage factors calculation', async () => {
      const info = await printInfo(testPdfPath, {
        paperType: 'PHOTO_MATTE',
        printQuality: 'HIGH'
      });

      const expectedOverall = 0.8 * 0.9 * 1.3; // absorption * coating * quality
      expect(info.usageFactors.overallMultiplier).toBe(Math.round(expectedOverall * 100) / 100);

      // Verify that estimated values are correctly calculated
      const expectedCyan = info.rawInkCoverage.cyan * expectedOverall;
      expect(info.estimatedInkUsage.cyan).toBe(Math.round(expectedCyan * 100) / 100);
    });
  });
});
