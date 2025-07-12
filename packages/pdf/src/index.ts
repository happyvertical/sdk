import { extractText, extractImages, getDocumentProxy } from 'unpdf'
import fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

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
    const { default: OcrNode } = await import('@gutenye/ocr-node')
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
    const { default: OcrNode } = await import('@gutenye/ocr-node')
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
 * Paper type definitions with material properties for ink usage calculations
 */
export const PaperTypes = {
  /**
   * Standard office paper (20lb bond, uncoated)
   * Base absorption rate, moderate ink usage
   */
  PLAIN: {
    name: 'Plain Paper',
    absorptionMultiplier: 1.0,
    coatingFactor: 1.0,
    description: 'Standard office paper, uncoated'
  },
  /**
   * Photo paper with glossy coating
   * Low absorption, ink sits on surface
   */
  PHOTO_GLOSSY: {
    name: 'Photo Paper (Glossy)',
    absorptionMultiplier: 0.7,
    coatingFactor: 0.8,
    description: 'Glossy photo paper, coated surface'
  },
  /**
   * Photo paper with matte finish
   * Medium absorption, slightly more ink usage than glossy
   */
  PHOTO_MATTE: {
    name: 'Photo Paper (Matte)',
    absorptionMultiplier: 0.8,
    coatingFactor: 0.9,
    description: 'Matte photo paper, semi-coated'
  },
  /**
   * Heavy cardstock paper
   * Higher absorption due to thickness and texture
   */
  CARDSTOCK: {
    name: 'Cardstock',
    absorptionMultiplier: 1.2,
    coatingFactor: 1.1,
    description: 'Heavy cardstock, higher absorption'
  },
  /**
   * Premium office paper (24lb bond, lightly coated)
   * Slightly less absorption than plain paper
   */
  PREMIUM: {
    name: 'Premium Paper',
    absorptionMultiplier: 0.9,
    coatingFactor: 0.95,
    description: 'Premium office paper, lightly coated'
  },
  /**
   * Recycled paper
   * Higher absorption due to fiber composition
   */
  RECYCLED: {
    name: 'Recycled Paper',
    absorptionMultiplier: 1.1,
    coatingFactor: 1.05,
    description: 'Recycled paper, higher absorption'
  }
} as const

/**
 * Print quality settings that affect ink usage
 */
export const PrintQualities = {
  /**
   * Draft quality - less ink usage
   */
  DRAFT: {
    name: 'Draft',
    inkMultiplier: 0.7,
    description: 'Draft quality, reduced ink usage'
  },
  /**
   * Normal quality - standard ink usage
   */
  NORMAL: {
    name: 'Normal',
    inkMultiplier: 1.0,
    description: 'Normal quality, standard ink usage'
  },
  /**
   * High quality - increased ink usage
   */
  HIGH: {
    name: 'High',
    inkMultiplier: 1.3,
    description: 'High quality, increased ink usage'
  },
  /**
   * Photo quality - maximum ink usage
   */
  PHOTO: {
    name: 'Photo',
    inkMultiplier: 1.5,
    description: 'Photo quality, maximum ink usage'
  }
} as const

/**
 * Paper type definition interface
 */
export interface PaperTypeDefinition {
  name: string
  absorptionMultiplier: number
  coatingFactor: number
  description: string
}

/**
 * Print quality definition interface
 */
export interface PrintQualityDefinition {
  name: string
  inkMultiplier: number
  description: string
}

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
  /**
   * Paper type affecting ink absorption and usage. Defaults to PLAIN
   */
  paperType?: PaperTypeDefinition | keyof typeof PaperTypes
  /**
   * Print quality setting affecting ink usage. Defaults to NORMAL
   */
  printQuality?: PrintQualityDefinition | keyof typeof PrintQualities
  /**
   * Custom material properties for advanced users
   */
  customMaterialProperties?: {
    absorptionMultiplier: number
    coatingFactor: number
    description?: string
  }
}

/**
 * Print information result interface
 */
export interface PrintInfo {
  /**
   * Raw ink coverage percentage from Ghostscript (base measurements)
   */
  rawInkCoverage: {
    cyan: number
    magenta: number
    yellow: number
    black: number
  }
  /**
   * Adjusted ink usage estimates accounting for paper type and print quality
   */
  estimatedInkUsage: {
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
   * Paper type information used for calculations
   */
  paperType: PaperTypeDefinition
  /**
   * Print quality information used for calculations
   */
  printQuality: PrintQualityDefinition
  /**
   * Raw total coverage percentage (sum of raw channels capped at 100%)
   */
  rawTotalCoverage: number
  /**
   * Estimated total ink usage (sum of adjusted channels capped at 100%)
   */
  estimatedTotalUsage: number
  /**
   * Number of pages analyzed
   */
  pagesAnalyzed: number
  /**
   * Ink usage factors applied to calculations
   */
  usageFactors: {
    absorptionMultiplier: number
    coatingFactor: number
    qualityMultiplier: number
    overallMultiplier: number
  }
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
 * // Basic usage with default paper type (plain) and quality (normal)
 * const info = await printInfo('/path/to/document.pdf');
 * console.log(`Raw total coverage: ${info.rawTotalCoverage}%`);
 * console.log(`Estimated ink usage: ${info.estimatedTotalUsage}%`);
 * console.log(`Black ink (raw): ${info.rawInkCoverage.black}%`);
 * console.log(`Black ink (estimated): ${info.estimatedInkUsage.black}%`);
 * 
 * // Using specific paper type and print quality
 * const photoInfo = await printInfo('/path/to/photo.pdf', {
 *   paperType: 'PHOTO_GLOSSY',
 *   printQuality: 'PHOTO'
 * });
 * 
 * // Using custom material properties
 * const customInfo = await printInfo('/path/to/document.pdf', {
 *   customMaterialProperties: {
 *     absorptionMultiplier: 0.85,
 *     coatingFactor: 0.9,
 *     description: 'Custom premium paper'
 *   }
 * });
 * ```
 */
export async function printInfo(
  pdfPath: string,
  options: PrintInfoOptions = {}
): Promise<PrintInfo> {
  const paperSize = options.paperSize || PaperSizes.LETTER
  
  // Resolve paper type
  let paperType: PaperTypeDefinition
  if (options.customMaterialProperties) {
    paperType = {
      name: 'Custom',
      absorptionMultiplier: options.customMaterialProperties.absorptionMultiplier,
      coatingFactor: options.customMaterialProperties.coatingFactor,
      description: options.customMaterialProperties.description || 'Custom material properties'
    }
  } else if (typeof options.paperType === 'string') {
    paperType = PaperTypes[options.paperType as keyof typeof PaperTypes]
  } else if (options.paperType) {
    paperType = options.paperType
  } else {
    paperType = PaperTypes.PLAIN
  }
  
  // Resolve print quality
  let printQuality: PrintQualityDefinition
  if (typeof options.printQuality === 'string') {
    printQuality = PrintQualities[options.printQuality as keyof typeof PrintQualities]
  } else if (options.printQuality) {
    printQuality = options.printQuality
  } else {
    printQuality = PrintQualities.NORMAL
  }
  
  try {
    // Use Ghostscript's inkcov device to calculate raw ink coverage
    const rawInkCoverage = await calculateInkCoverageWithGhostscript(pdfPath, options.pages)
    
    // Calculate usage factors
    const absorptionMultiplier = paperType.absorptionMultiplier
    const coatingFactor = paperType.coatingFactor
    const qualityMultiplier = printQuality.inkMultiplier
    const overallMultiplier = absorptionMultiplier * coatingFactor * qualityMultiplier
    
    // Apply paper type and quality adjustments to ink usage
    const estimatedInkUsage = {
      cyan: rawInkCoverage.cyan * overallMultiplier,
      magenta: rawInkCoverage.magenta * overallMultiplier,
      yellow: rawInkCoverage.yellow * overallMultiplier,
      black: rawInkCoverage.black * overallMultiplier
    }
    
    // Calculate totals
    const rawTotalCoverage = Math.min(100, rawInkCoverage.total)
    const estimatedTotalUsage = Math.min(100, 
      estimatedInkUsage.cyan + estimatedInkUsage.magenta + 
      estimatedInkUsage.yellow + estimatedInkUsage.black
    )
    
    return {
      rawInkCoverage: {
        cyan: Math.round(rawInkCoverage.cyan * 100) / 100,
        magenta: Math.round(rawInkCoverage.magenta * 100) / 100,
        yellow: Math.round(rawInkCoverage.yellow * 100) / 100,
        black: Math.round(rawInkCoverage.black * 100) / 100,
      },
      estimatedInkUsage: {
        cyan: Math.round(estimatedInkUsage.cyan * 100) / 100,
        magenta: Math.round(estimatedInkUsage.magenta * 100) / 100,
        yellow: Math.round(estimatedInkUsage.yellow * 100) / 100,
        black: Math.round(estimatedInkUsage.black * 100) / 100,
      },
      paperSize,
      paperType,
      printQuality,
      rawTotalCoverage: Math.round(rawTotalCoverage * 100) / 100,
      estimatedTotalUsage: Math.round(estimatedTotalUsage * 100) / 100,
      pagesAnalyzed: rawInkCoverage.pagesAnalyzed,
      usageFactors: {
        absorptionMultiplier: Math.round(absorptionMultiplier * 100) / 100,
        coatingFactor: Math.round(coatingFactor * 100) / 100,
        qualityMultiplier: Math.round(qualityMultiplier * 100) / 100,
        overallMultiplier: Math.round(overallMultiplier * 100) / 100
      }
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
  // Build the ghostscript command manually using execAsync
  const gsArgs = [
    '-sDEVICE=inkcov',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    '-sOutputFile=%stdout'
  ]
  
  // Add page range if specified
  if (pages && pages !== 'all' && Array.isArray(pages)) {
    if (pages.length === 0) {
      // Empty pages array means no pages should be processed
      return {
        cyan: 0,
        magenta: 0,
        yellow: 0,
        black: 0,
        total: 0,
        pagesAnalyzed: 0
      }
    }
    
    const pageRange = pages.sort((a, b) => a - b).join(',')
    gsArgs.push(`-sPageList=${pageRange}`)
  }
  
  // Add the PDF file path
  gsArgs.push(pdfPath)
  
  // Execute Ghostscript command
  const command = `gs ${gsArgs.join(' ')}`
  
  try {
    const { stdout } = await execAsync(command)
    
    if (!stdout) {
      throw new Error('Ghostscript did not produce any output')
    }
    
    // Parse Ghostscript inkcov output
    const result = parseInkCoverageOutput(stdout)
    return result
  } catch (execError) {
    throw new Error(`Ghostscript error: ${execError instanceof Error ? execError.message : 'Unknown error'}`)
  }
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
  if (!output || typeof output !== 'string') {
    throw new Error('Invalid output: expected non-empty string')
  }
  
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
    // No pages were analyzed (possibly out-of-range page numbers)
    return {
      cyan: 0,
      magenta: 0,
      yellow: 0,
      black: 0,
      total: 0,
      pagesAnalyzed: 0
    }
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
