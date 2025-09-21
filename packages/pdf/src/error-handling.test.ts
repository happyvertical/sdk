import { it, expect, describe, beforeEach } from "vitest";
import { getPDFReader } from "./index.js";
import type { PDFReader } from "./shared/types.js";

describe("PDF Error Handling", () => {
  let reader: PDFReader;

  beforeEach(async () => {
    reader = await getPDFReader();
  });

  it("should handle invalid inputs gracefully", async () => {
    // Test various invalid inputs
    expect(await reader.extractText(null as any)).toBeNull();
    expect(await reader.extractText(undefined as any)).toBeNull();
    expect(await reader.extractText('' as any)).toBeNull();
    expect(await reader.extractText({} as any)).toBeNull();
  });

  it("should handle non-existent files gracefully", async () => {
    const text = await reader.extractText('/non/existent/file.pdf');
    expect(text).toBeNull();
  });

  it("should handle corrupted PDF data gracefully", async () => {
    const invalidPDF = new Uint8Array([0x25, 0x50]); // Only "%P" instead of "%PDF-"
    const text = await reader.extractText(invalidPDF);
    expect(text).toBeNull();
  });
});