import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDocument } from './factory';
import type { Document } from './types';

// Get the directory of this test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('@have/documents', () => {
  describe('fetchDocument', () => {
    it('should fetch and process a PDF document', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Signed Minutes - September 9, 2025 Regular Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      const doc = await fetchDocument(fileUrl);

      expect(doc).toBeDefined();
      // URL will be normalized/encoded
      expect(doc.url).toContain('Signed');
      expect(doc.url).toContain('Minutes');
      expect(doc.type).toBe('application/pdf');
      expect(doc.parts).toBeDefined();
      expect(doc.parts.length).toBeGreaterThan(0);

      const mainPart = doc.parts[0];
      expect(mainPart.id).toBeDefined();
      expect(mainPart.title).toBeDefined();
      expect(mainPart.title).toContain('Signed');
      expect(mainPart.content).toBeDefined();
      expect(mainPart.type).toBe('text');
      // Note: Text extraction quality depends on @have/pdf package
      // We just verify the structure is correct
    }, 30000); // 30 second timeout for PDF processing

    it('should handle document structure correctly', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Signed Minutes - September 9, 2025 Regular Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      const doc = await fetchDocument(fileUrl);

      const mainPart = doc.parts[0];
      // Verify document structure
      expect(mainPart).toHaveProperty('id');
      expect(mainPart).toHaveProperty('title');
      expect(mainPart).toHaveProperty('content');
      expect(mainPart).toHaveProperty('type');
      expect(mainPart).toHaveProperty('metadata');
    }, 30000);

    it('should handle large PDF documents', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Agenda-Package-September-9-2025-Regular-Council-Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      const doc = await fetchDocument(fileUrl);

      expect(doc).toBeDefined();
      expect(doc.parts).toBeDefined();
      expect(doc.parts.length).toBeGreaterThan(0);

      const mainPart = doc.parts[0];
      expect(mainPart.content).toBeDefined();
      // Large document should have some structure
      expect(mainPart.metadata).toBeDefined();
    }, 60000); // 60 second timeout for large PDF

    it('should cache processed PDFs', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Signed Minutes - September 9, 2025 Regular Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      // First fetch
      const startTime1 = Date.now();
      const doc1 = await fetchDocument(fileUrl);
      const duration1 = Date.now() - startTime1;

      // Second fetch (should use cache)
      const startTime2 = Date.now();
      const doc2 = await fetchDocument(fileUrl);
      const duration2 = Date.now() - startTime2;

      // Verify both documents are identical
      expect(doc1.parts[0].content).toBe(doc2.parts[0].content);

      // Second fetch should be significantly faster (cached)
      // Allow for some variance - cached should be at least 30% faster
      if (duration1 > 100) {
        expect(duration2).toBeLessThan(duration1 * 0.7);
      }
    }, 60000);

    it('should include metadata about the document', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Signed Minutes - September 9, 2025 Regular Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      const doc = await fetchDocument(fileUrl);

      expect(doc.metadata).toBeDefined();
      expect(doc.metadata.processor).toBe('pdf');
      expect(doc.metadata.extractedAt).toBeDefined();
      expect(doc.metadata.hasImages).toBeDefined();
    }, 30000);

    it('should handle extractImages option', async () => {
      const testPdfPath = path.resolve(
        __dirname,
        '../testdata/Signed Minutes - September 9, 2025 Regular Meeting.pdf',
      );
      const fileUrl = `file://${testPdfPath}`;

      // Clear cache to ensure fresh processing with extractImages option
      const { getCached, setCached } = await import('@have/files');
      await setCached(`${testPdfPath}.processed_pdf`, '');

      // With image extraction enabled
      const doc = await fetchDocument(fileUrl, { extractImages: true });
      const mainPart = doc.parts[0];

      // Images should be defined when extraction is enabled
      expect(mainPart.images).toBeDefined();
      expect(Array.isArray(mainPart.images)).toBe(true);
      // Currently returns empty array as placeholder for future implementation
    }, 60000);

    it('should throw error for unsupported document type', async () => {
      const invalidUrl = 'file:///path/to/nonexistent.invalid';

      await expect(fetchDocument(invalidUrl)).rejects.toThrow(
        /No processor available/,
      );
    });
  });
});
