import { extractText, extractImages, getDocumentProxy } from 'unpdf'
import OcrNode from '@gutenye/ocr-node'
import fs from 'fs/promises'

/**
 * Checks if OCR dependencies are available in the current environment
 * 
 * @returns Promise resolving to dependency check result
 * 
 * @remarks
 * This function verifies that ONNX Runtime and required system libraries
 * are available for OCR functionality. Useful for graceful degradation.
 */
export async function checkOCRDependencies(): Promise<{
  available: boolean
  error?: string
  details: {
    ocrNode: boolean
    systemLibraries: boolean
  }
}> {
  const result: {
    available: boolean
    error?: string
    details: {
      ocrNode: boolean
      systemLibraries: boolean
    }
  } = {
    available: false,
    details: {
      ocrNode: false,
      systemLibraries: false
    }
  }

  try {
    // Test if OCR Node module can be imported and initialized
    const ocr = await OcrNode.create()
    
    if (ocr && typeof ocr.detect === 'function') {
      result.details.ocrNode = true
      result.details.systemLibraries = true
      result.available = true
      
      // Clean up test instance
      if (typeof ocr.destroy === 'function') {
        try {
          await ocr.destroy()
        } catch {
          // Ignore cleanup errors
        }
      }
    }
    
    return result
  } catch (error: any) {
    const errorMessage = error.message || error.toString()
    
    // Categorize the error
    if (errorMessage.includes('libstdc++') || errorMessage.includes('GLIBC') || errorMessage.includes('cannot open shared object')) {
      result.error = `Missing system libraries: ${errorMessage}`
      result.details.systemLibraries = false
    } else if (errorMessage.includes('onnxruntime') || errorMessage.includes('ONNX')) {
      result.error = `ONNX Runtime error: ${errorMessage}`
      result.details.systemLibraries = false
    } else {
      result.error = `OCR initialization failed: ${errorMessage}`
    }
    
    return result
  }
}

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
 * Performs OCR on image data using @gutenye/ocr-node
 * 
 * @param images - Array of image objects from PDF extraction
 * @returns Promise resolving to the OCR text
 * 
 * @remarks
 * This function processes image data through PaddleOCR + ONNX Runtime.
 * It's used as a fallback when direct text extraction fails.
 * This implementation is Bun-compatible unlike the previous Tesseract.js version.
 * 
 * The function includes dependency checking and graceful degradation.
 */
async function performOCROnImages(images: any[]): Promise<string> {
  if (!images || images.length === 0) {
    return ''
  }

  // Check OCR dependencies first
  const dependencyCheck = await checkOCRDependencies()
  if (!dependencyCheck.available) {
    console.warn('OCR dependencies not available:', dependencyCheck.error)
    console.warn('Skipping OCR processing. Install system dependencies for OCR functionality.')
    return ''
  }

  let ocrText = ''
  let ocr: any = null
  
  try {
    // Initialize OCR engine once for all images
    ocr = await OcrNode.create()
    
    for (const image of images) {
      try {
        // Handle different image data formats from unpdf
        let imageData = image.data || image
        
        // Skip if no valid image data
        if (!imageData) {
          continue
        }
        
        // Convert image data to Buffer if needed
        const buffer = imageData instanceof Buffer ? imageData : Buffer.from(imageData)
        
        // Perform OCR using @gutenye/ocr-node
        const result = await ocr.detect(buffer)
        
        // Extract text from OCR results
        if (result && Array.isArray(result)) {
          for (const detection of result) {
            if (detection && detection.text) {
              ocrText += detection.text + ' '
            }
          }
        }
      } catch (imageError: any) {
        console.warn('Failed to process image for OCR:', imageError.message || imageError)
        continue
      }
    }
  } catch (error: any) {
    console.error('OCR processing failed:', error.message || error)
    console.error('This may indicate missing system dependencies. Run checkOCRDependencies() for details.')
  } finally {
    // Clean up OCR resources if needed
    if (ocr && typeof ocr.destroy === 'function') {
      try {
        await ocr.destroy()
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
  
  return ocrText.trim()
}
