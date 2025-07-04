import { extractText, extractImages, getDocumentProxy } from 'unpdf'
import { createWorker } from 'tesseract.js'
import fs from 'fs/promises'

/**
 * Extracts images from all pages of a PDF file
 * 
 * @param pdfPath - Path to the PDF file
 * @returns Promise resolving to an array of image objects or null if extraction fails
 * 
 * @remarks
 * This function uses unpdf's optimized PDF.js build to extract images from all pages.
 * Each image object contains the image data and metadata (width, height, channels).
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
    const buffer = await fs.readFile(pdfPath)
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    
    // Extract from all pages
    const allImages = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const images = await extractImages(pdf, pageNum)
      allImages.push(...images)
    }
    
    return allImages
  } catch (error) {
    console.error('Error extracting images:', error)
    return null
  }
}

/**
 * Extracts text content from a PDF file
 * 
 * @param pdfPath - Path to the PDF file
 * @returns Promise resolving to the extracted text or null if extraction fails
 * 
 * @remarks
 * This function first attempts to extract text using unpdf's native text extraction.
 * If no text is found (e.g., in the case of scanned PDFs), it falls back to OCR using
 * tesseract.js to extract text from the document images.
 * 
 * The function processes all pages in the PDF and merges the text.
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
    const buffer = await fs.readFile(pdfPath)
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    
    // If no text was found, try OCR as a fallback
    if (!text?.trim()) {
      const images = await extractImagesFromPDF(pdfPath)
      if (images?.length) {
        return await performOCROnImages(images)
      }
    }
    
    return text || null
  } catch (error) {
    console.error(`Error extracting text from ${pdfPath}:`, error)
    return null
  }
}

/**
 * Performs OCR on image data using Tesseract.js
 * 
 * @param images - Array of image objects from PDF extraction
 * @returns Promise resolving to the OCR text
 * 
 * @remarks
 * This function processes image data through Tesseract.js OCR engine.
 * It's used as a fallback when direct text extraction fails.
 */
async function performOCROnImages(images: any[]): Promise<string> {
  if (!images || images.length === 0) {
    return ''
  }

  const worker = await createWorker()
  let ocrText = ''
  
  try {
    for (const image of images) {
      try {
        // Handle different image data formats from unpdf
        let imageData = image.data || image
        
        // Skip if no valid image data
        if (!imageData) {
          continue
        }
        
        // Try to recognize the image
        // Note: Tesseract.js may fail with certain image formats in Bun
        const { data } = await worker.recognize(imageData)
        ocrText += data.text + ' '
      } catch (imageError: any) {
        // Known issue: Tesseract.js has compatibility issues with Bun
        // Error: "Error attempting to read image" is expected in some cases
        if (imageError?.message?.includes('Error attempting to read image')) {
          console.warn('Tesseract.js image format compatibility issue (known Bun limitation):', imageError.message)
        } else {
          console.warn('Failed to process image for OCR:', imageError)
        }
        continue
      }
    }
  } finally {
    try {
      await worker.terminate()
    } catch (terminateError) {
      // Ignore termination errors
    }
  }
  
  return ocrText.trim()
}
