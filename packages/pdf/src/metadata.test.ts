import { it, expect, describe, beforeEach } from "vitest";
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPDFReader } from "./index.js";
import type { PDFReader } from "./shared/types.js";

describe("PDF Metadata Extraction", () => {
  let reader: PDFReader;

  beforeEach(async () => {
    reader = await getPDFReader();
  });

  it("should extract metadata from a real PDF file", async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const metadata = await reader.extractMetadata(pdfPath);
    
    // Validate required properties
    expect(metadata).toHaveProperty('pageCount');
    expect(typeof metadata.pageCount).toBe('number');
    expect(metadata.pageCount).toBeGreaterThan(0);
    
    // Validate optional properties have correct types if present
    if (metadata.title !== undefined) {
      expect(typeof metadata.title).toBe('string');
    }
    if (metadata.author !== undefined) {
      expect(typeof metadata.author).toBe('string');
    }
  }, 30000);

  it("should handle metadata extraction from non-existent file", async () => {
    const metadata = await reader.extractMetadata('/non/existent/file.pdf').catch(() => null);
    
    // Should either throw an error (caught above) or return basic metadata
    if (metadata) {
      expect(metadata).toHaveProperty('pageCount');
    }
  });
});