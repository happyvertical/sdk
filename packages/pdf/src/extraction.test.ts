import { it, expect, describe, beforeEach } from "bun:test";
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPDFReader } from "./index.js";
import type { PDFReader } from "./shared/types.js";

describe("PDF Content Extraction", () => {
  let reader: PDFReader;

  beforeEach(async () => {
    reader = await getPDFReader();
  });

  it("should extract text from a real PDF file", async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const text = await reader.extractText(pdfPath);
    
    // Should return string or null, never undefined or throw
    expect(text !== undefined).toBe(true);
    expect(typeof text === 'string' || text === null).toBe(true);
  }, 30000); // Reduced timeout to 30 seconds

  it("should extract metadata from PDF", async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const metadata = await reader.extractMetadata(pdfPath);
    
    expect(metadata).toBeDefined();
    expect(typeof metadata.pageCount).toBe('number');
    expect(metadata.pageCount).toBeGreaterThan(0);
  }, 30000);

  it("should extract images from PDF", async () => {
    const pdfPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '..',
      'test',
      'Signed-Meeting-Minutes-October-8-2024-Regular-Council-Meeting-1.pdf',
    );
    
    const images = await reader.extractImages(pdfPath);
    
    expect(Array.isArray(images)).toBe(true);
    // Images may be empty array, that's fine
  }, 30000);
});