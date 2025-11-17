import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PDFProcessor } from './pdf';

describe('PDFProcessor', () => {
  const processor = new PDFProcessor();
  let tempDir: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = join(
      process.env.TMPDIR || '/tmp',
      `pdf-processor-test-${Date.now()}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
  });

  describe('cache poisoning prevention (issue #463)', () => {
    it('should delete cache file when HTML is detected instead of PDF', async () => {
      // Create a fake cache file with HTML content
      const cachePath = join(tempDir, 'fake-document.pdf');
      const htmlContent =
        '<!DOCTYPE html><html><body>Fake tracking page</body></html>';
      await fs.writeFile(cachePath, htmlContent);

      // Verify file exists before processing
      await expect(fs.access(cachePath)).resolves.toBeUndefined();

      // Try to process - should detect HTML and delete the file
      await expect(
        processor.process(`file://${cachePath}`, { cacheDir: tempDir }),
      ).rejects.toThrow('Downloaded file is HTML, not PDF');

      // Verify the poisoned cache file was deleted
      await expect(fs.access(cachePath)).rejects.toThrow();
    });

    it('should delete cache file when invalid PDF header is detected', async () => {
      // Create a fake cache file with invalid PDF header
      const cachePath = join(tempDir, 'invalid-document.pdf');
      const invalidContent = 'NOTAPDF\x00\x00\x00\x00some random bytes';
      await fs.writeFile(cachePath, invalidContent);

      // Verify file exists before processing
      await expect(fs.access(cachePath)).resolves.toBeUndefined();

      // Try to process - should detect invalid PDF and delete the file
      await expect(
        processor.process(`file://${cachePath}`, { cacheDir: tempDir }),
      ).rejects.toThrow('Downloaded file is not a valid PDF');

      // Verify the invalid cache file was deleted
      await expect(fs.access(cachePath)).rejects.toThrow();
    });

    it('should provide helpful error message for HTML cache poisoning', async () => {
      const cachePath = join(tempDir, 'wordpress-tracking.pdf');
      const htmlContent =
        '<!DOCTYPE html><html><body>WordPress Download Manager</body></html>';
      await fs.writeFile(cachePath, htmlContent);

      await expect(
        processor.process(`file://${cachePath}`, { cacheDir: tempDir }),
      ).rejects.toThrow(
        /WordPress Download Manager.*poisoned cache file has been removed/,
      );
    });
  });

  describe('supports()', () => {
    it('should support application/pdf type', () => {
      expect(processor.supports('application/pdf')).toBe(true);
    });

    it('should support .pdf extension', () => {
      expect(processor.supports('.pdf')).toBe(true);
    });

    it('should support pdf string', () => {
      expect(processor.supports('pdf')).toBe(true);
      expect(processor.supports('PDF')).toBe(true);
    });

    it('should not support non-PDF types', () => {
      expect(processor.supports('text/html')).toBe(false);
      expect(processor.supports('application/json')).toBe(false);
      expect(processor.supports('.txt')).toBe(false);
    });
  });
});
