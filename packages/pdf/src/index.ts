import { extractText, extractImages, getDocumentProxy } from 'unpdf'
import OcrNode from '@gutenye/ocr-node'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import gs from 'node-gs'

const execAsync = promisify(exec)

/**
 * Checks if required system libraries are available
 * 
 * @returns Promise resolving to boolean indicating if system libraries are available
 * 
 * @remarks
 * This function checks for the presence of required system libraries including
 * libstdc++.so.6 and libonnxruntime.so using ldconfig.
 */
async function checkSystemLibraries(): Promise<boolean> {
  try {
    // Check for libstdc++.so.6 (C++ Standard Library)
    const { stdout: libstdcResult } = await execAsync('ldconfig -p | grep libstdc++.so.6 || echo "not found"')
    const hasLibstdc = !libstdcResult.includes('not found')
    
    // Check for ONNX Runtime library
    const { stdout: onnxResult } = await execAsync('ldconfig -p | grep libonnxruntime.so || echo "not found"')
    const hasOnnx = !onnxResult.includes('not found')
    
    return hasLibstdc && hasOnnx
  } catch (error) {
    // If we can't run ldconfig, assume libraries are not available
    return false
  }
}

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
    // First check if system libraries are available
    result.details.systemLibraries = await checkSystemLibraries()
    
    // Test if OCR Node module can be imported and initialized
    const ocr = await OcrNode.create()
    
    if (ocr && typeof ocr.detect === 'function') {
      result.details.ocrNode = true
      result.available = result.details.systemLibraries && result.details.ocrNode
      
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
export async function performOCROnImages(images: any[]): Promise<string> {
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

/**
 * Paper size definitions in inches
 */
export const PaperSizes = {
  LETTER: { width: 8.5, height: 11 },
  LEGAL: { width: 8.5, height: 14 },
  A4: { width: 8.27, height: 11.69 },
  A3: { width: 11.69, height: 16.54 },
  TABLOID: { width: 11, height: 17 },
} as const

/**
 * Options for printInfo function
 */
export interface PrintInfoOptions {
  /**
   * Paper size in inches. Defaults to US Letter (8.5" x 11")
   */
  paperSize?: {
    width: number
    height: number
  }
  /**
   * Whether to analyze all pages or specific pages
   */
  pages?: number[] | 'all'
}

/**
 * Print information result interface
 */
export interface PrintInfo {
  /**
   * Ink coverage percentage for each CMYK channel
   */
  inkCoverage: {
    cyan: number
    magenta: number
    yellow: number
    black: number
  }
  /**
   * Paper size used for calculations (in inches)
   */
  paperSize: {
    width: number
    height: number
  }
  /**
   * Total ink coverage percentage (sum of all channels capped at 100%)
   */
  totalCoverage: number
  /**
   * Number of pages analyzed
   */
  pagesAnalyzed: number
}

/**
 * Calculates printing information for a PDF including ink coverage estimates using Ghostscript
 * 
 * @param pdfPath - Path to the PDF file
 * @param options - Options for print analysis
 * @returns Promise resolving to print information including CMYK ink coverage
 * 
 * @remarks
 * This function uses Ghostscript's inkcov device to calculate actual ink coverage
 * for each CMYK color channel. This provides accurate estimates for printing costs.
 * 
 * @example
 * ```typescript
 * const printInfo = await printInfo('/path/to/document.pdf');
 * console.log(`Total ink coverage: ${printInfo.totalCoverage}%`);
 * console.log(`Black ink: ${printInfo.inkCoverage.black}%`);
 * ```
 */
export async function printInfo(
  pdfPath: string,
  options: PrintInfoOptions = {}
): Promise<PrintInfo> {
  const paperSize = options.paperSize || PaperSizes.LETTER
  
  try {
    // Use Ghostscript's inkcov device to calculate ink coverage
    const inkCoverage = await calculateInkCoverageWithGhostscript(pdfPath, options.pages)
    
    return {
      inkCoverage: {
        cyan: Math.round(inkCoverage.cyan * 100) / 100,
        magenta: Math.round(inkCoverage.magenta * 100) / 100,
        yellow: Math.round(inkCoverage.yellow * 100) / 100,
        black: Math.round(inkCoverage.black * 100) / 100,
      },
      paperSize,
      totalCoverage: Math.round(inkCoverage.total * 100) / 100,
      pagesAnalyzed: inkCoverage.pagesAnalyzed
    }
  } catch (error) {
    console.error('Error calculating print info:', error)
    throw new Error(`Failed to calculate print info: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Uses Ghostscript's inkcov device to calculate actual ink coverage
 */
async function calculateInkCoverageWithGhostscript(
  pdfPath: string,
  pages?: number[] | 'all'
): Promise<{
  cyan: number
  magenta: number
  yellow: number
  black: number
  total: number
  pagesAnalyzed: number
}> {
  return new Promise((resolve, reject) => {
    // Configure Ghostscript options for ink coverage calculation
    const gsOptions = [
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=inkcov',
      '-sOutputFile=%stdout'
    ]
    
    // Add page range if specified
    if (pages && pages !== 'all' && Array.isArray(pages) && pages.length > 0) {
      const pageRange = pages.sort((a, b) => a - b).join(',')
      gsOptions.push(`-sPageList=${pageRange}`)
    }
    
    gsOptions.push(pdfPath)
    
    // Execute Ghostscript
    gs()
      .device('inkcov')
      .option('-dNOPAUSE')
      .option('-dBATCH')
      .option('-dSAFER')
      .input(pdfPath)
      .output('%stdout')
      .exec((err: any, stdout: string, stderr: string) => {
        if (err) {
          reject(new Error(`Ghostscript error: ${err.message || err}`))
          return
        }
        
        try {
          // Parse Ghostscript inkcov output
          const result = parseInkCoverageOutput(stdout)
          resolve(result)
        } catch (parseError) {
          reject(new Error(`Failed to parse ink coverage output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`))
        }
      })
  })
}

/**
 * Parses Ghostscript inkcov output format
 * 
 * @param output - Raw output from Ghostscript inkcov device
 * @returns Parsed ink coverage data
 * 
 * @remarks
 * Ghostscript inkcov output format per page:
 * Page 1
 *  0.12345  0.23456  0.34567  0.45678 CMYK OK
 * 
 * Values are decimal percentages (0.0 to 1.0)
 */
function parseInkCoverageOutput(output: string): {
  cyan: number
  magenta: number
  yellow: number
  black: number
  total: number
  pagesAnalyzed: number
} {
  const lines = output.split('\n').filter(line => line.trim())
  let totalCyan = 0
  let totalMagenta = 0
  let totalYellow = 0
  let totalBlack = 0
  let pagesAnalyzed = 0
  
  for (const line of lines) {
    // Look for lines with CMYK coverage data
    const cmykMatch = line.match(/^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+CMYK/)
    
    if (cmykMatch) {
      const [, cyan, magenta, yellow, black] = cmykMatch
      
      // Convert from decimal (0.0-1.0) to percentage (0-100)
      totalCyan += parseFloat(cyan) * 100
      totalMagenta += parseFloat(magenta) * 100
      totalYellow += parseFloat(yellow) * 100
      totalBlack += parseFloat(black) * 100
      pagesAnalyzed++
    }
  }
  
  if (pagesAnalyzed === 0) {
    throw new Error('No ink coverage data found in Ghostscript output')
  }
  
  // Calculate averages
  const avgCyan = totalCyan / pagesAnalyzed
  const avgMagenta = totalMagenta / pagesAnalyzed
  const avgYellow = totalYellow / pagesAnalyzed
  const avgBlack = totalBlack / pagesAnalyzed
  
  // Total coverage is sum of all channels (can exceed 100% for overlapping colors)
  const total = avgCyan + avgMagenta + avgYellow + avgBlack
  
  return {
    cyan: avgCyan,
    magenta: avgMagenta,
    yellow: avgYellow,
    black: avgBlack,
    total: Math.min(100, total), // Cap at 100% for UI display
    pagesAnalyzed
  }
}
