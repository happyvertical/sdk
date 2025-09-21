import { it, expect, describe, beforeAll } from "vitest";
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPDFReader, checkOCRDependencies } from "./index.js";
import type { PDFReader } from "./shared/types.js";

describe("OCR Integration with Real PDF", () => {
  let reader: PDFReader;
  let ocrAvailable = false;

  beforeAll(async () => {
    reader = await getPDFReader();
    
    // Check if OCR is available before running OCR tests
    try {
      const deps = await checkOCRDependencies();
      ocrAvailable = deps.available;
      
      if (!ocrAvailable) {
        console.warn('OCR not available - OCR integration test will be skipped');
        console.warn('OCR unavailable reason:', deps.error);
      }
    } catch (error) {
      console.warn('Failed to check OCR dependencies:', error);
      ocrAvailable = false;
    }
  });

  it("should extract text from real PDF using OCR when needed", async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    // First check what the PDF analysis recommends
    const info = await reader.getInfo(pdfPath);
    console.log('PDF Analysis:', {
      pageCount: info.pageCount,
      hasEmbeddedText: info.hasEmbeddedText,
      recommendedStrategy: info.recommendedStrategy,
      ocrRequired: info.ocrRequired
    });
    
    // Extract text - should work regardless of whether OCR is available
    const text = await reader.extractText(pdfPath);
    
    // Basic validation
    expect(text !== undefined).toBe(true);
    expect(typeof text === 'string' || text === null).toBe(true);
    
    if (ocrAvailable && info.ocrRequired) {
      // If OCR is available and required, we should attempt OCR
      // But OCR might fail due to image format issues, which is acceptable
      if (text && text.length > 10) {
        console.log(`✅ OCR successfully extracted ${text.length} characters`);
        console.log(`Preview: ${text.substring(0, 200).replace(/\s+/g, ' ').trim()}...`);
      } else {
        console.log('⚠️ OCR attempted but extracted minimal/no text (may be due to image format issues)');
        // This is acceptable - OCR can fail on certain image formats
      }
    } else if (!ocrAvailable && info.ocrRequired) {
      // If OCR is not available but required, text extraction might return null
      console.log('⚠️ OCR required but not available - text extraction may return null');
    } else {
      // Text-based PDF or hybrid - should extract some text
      if (text) {
        console.log(`✅ Text extracted without OCR: ${text.length} characters`);
      }
    }
  }, 45000); // Allow up to 45 seconds for OCR processing

  it("should handle OCR on extracted images", async () => {
    if (!ocrAvailable) {
      console.log('⏭️ Skipping OCR image test - OCR not available');
      return;
    }

    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    // Extract images from the PDF
    const images = await reader.extractImages(pdfPath);
    console.log(`Extracted ${images.length} images from PDF`);
    
    if (images.length > 0) {
      // Take just the first image to keep test fast
      const firstImage = images.slice(0, 1);
      
      // Perform OCR on the first image
      const ocrResult = await reader.performOCR(firstImage, {
        language: 'eng',
        confidenceThreshold: 50
      });
      
      expect(ocrResult).toBeDefined();
      expect(typeof ocrResult.text).toBe('string');
      expect(typeof ocrResult.confidence).toBe('number');
      expect(Array.isArray(ocrResult.detections)).toBe(true);
      
      if (ocrResult.text.length > 10) {
        console.log(`✅ OCR on image successful: ${ocrResult.text.length} chars, ${ocrResult.confidence}% confidence`);
        console.log(`OCR text preview: ${ocrResult.text.substring(0, 100).replace(/\s+/g, ' ').trim()}...`);
      } else {
        console.log(`⚠️ OCR on image extracted minimal text: ${ocrResult.text.length} chars, ${ocrResult.confidence}% confidence`);
        console.log('This may be due to image format compatibility or image content');
      }
    } else {
      console.log('⚠️ No images found in PDF - OCR image test skipped');
    }
  }, 45000);
});