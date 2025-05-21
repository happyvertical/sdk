import * as pdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';
import scribe from 'scribe.js-ocr';
import fs from 'fs';

/**
 * Extracts images from the first page of a PDF file
 * 
 * @param pdfPath - Path to the PDF file
 * @returns Promise resolving to an array of image objects or null if extraction fails
 * 
 * @remarks
 * This function uses PDF.js to extract image objects embedded in the first page of a PDF.
 * Each image object will contain properties specific to how PDF.js stores images, which
 * may include data, width, height, and other metadata.
 * 
 * @example
 * ```typescript
 * const images = await extractImagesFromPDF('/path/to/document.pdf');
 * if (images && images.length > 0) {
 *   console.log(`Found ${images.length} images in the PDF`);
 * }
 * ```
 */
export async function extractImagesFromPDF(
  pdfPath: string,
): Promise<any[] | null> {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfJs.getDocument(data);
    const pdf = await loadingTask.promise;

    const page = await pdf.getPage(1);
    
    const images: any[] = [];
    // Get all image keys and their corresponding objects
    const keys = page.commonObjs.getKeys();
    for (const key of keys) {
      if (key.startsWith('img_')) {
        const value = page.commonObjs.get(key);
        images.push(value);
      }
    }

    return images;
  } catch (error) {
    console.error('Error extracting images:', error);
    return null;
  }
}

/**
 * Extracts text content from a PDF file
 * 
 * @param pdfPath - Path to the PDF file
 * @returns Promise resolving to the extracted text or null if extraction fails
 * 
 * @remarks
 * This function first attempts to extract text using PDF.js's native text extraction.
 * If no text is found (e.g., in the case of scanned PDFs), it falls back to OCR using
 * the scribe.js-ocr library to extract text from the document.
 * 
 * The function processes all pages in the PDF and concatenates the text with spaces.
 * 
 * @example
 * ```typescript
 * const text = await extractTextFromPDF('/path/to/document.pdf');
 * if (text) {
 *   console.log(`Extracted ${text.length} characters of text`);
 * }
 * ```
 */
export async function extractTextFromPDF(pdfPath: string): Promise<string | null> {
  try {
    const loadingTask = pdfJs.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    let text = '';
    
    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: { str: string }) => item.str);
      text += strings.join(' ');
    }
    
    // If no text was found, try OCR as a fallback
    if (!text.trim()) {
      text = await scribe.extractText([pdfPath]);
    }
    
    return text;
  } catch (error) {
    console.error(`Error extracting text from ${pdfPath}:`, error);
    return null;
  }
}
