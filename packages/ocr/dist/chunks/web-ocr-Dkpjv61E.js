import { OCRDependencyError, OCRProcessingError } from "../index.js";
class WebOCRProvider {
  name = "web-ocr";
  tesseract = null;
  workers = /* @__PURE__ */ new Map();
  /**
   * Lazy load Tesseract.js module and verify browser compatibility.
   *
   * Loads the Tesseract.js module and validates that the current browser
   * environment supports the required features (WebAssembly, Web Workers).
   *
   * @returns The loaded Tesseract.js module
   * @throws {OCRDependencyError} If browser environment is incompatible
   * @private
   */
  async loadTesseract() {
    if (this.tesseract) {
      return this.tesseract;
    }
    const globalObj = globalThis;
    if (typeof globalObj.window === "undefined" || typeof globalObj.document === "undefined") {
      throw new Error(
        "WebOCRProvider can only be used in browser environments"
      );
    }
    try {
      const TesseractModule = await import("tesseract.js");
      this.tesseract = TesseractModule.default || TesseractModule;
      if (!this.tesseract || !this.tesseract.createWorker) {
        throw new Error("Tesseract.js module structure unexpected");
      }
      return this.tesseract;
    } catch (error) {
      throw new OCRDependencyError(this.name, error.message);
    }
  }
  /**
   * Get or create a Tesseract worker optimized for browser use.
   *
   * Creates workers with browser-specific optimizations including
   * progress logging and memory management. Workers are cached
   * per language to minimize initialization overhead.
   *
   * @param language - Language code for the worker
   * @returns Promise resolving to a browser-optimized Tesseract worker
   * @throws {OCRDependencyError} If worker creation fails
   * @private
   */
  async getWorker(language = "eng") {
    if (this.workers.has(language)) {
      return this.workers.get(language);
    }
    try {
      const tesseract = await this.loadTesseract();
      const worker = await tesseract.createWorker(language, {
        // Browser-specific options
        logger: (m) => {
          if (m.status === "recognizing text") {
            console.debug(`OCR Progress: ${m.progress * 100}%`);
          }
        }
      });
      this.workers.set(language, worker);
      return worker;
    } catch (error) {
      throw new OCRDependencyError(
        this.name,
        `Failed to create worker for ${language}: ${error.message}`
      );
    }
  }
  /**
   * Perform OCR processing in the browser using Tesseract.js and WebAssembly.
   *
   * Processes images entirely client-side with progress tracking and
   * memory-efficient handling. Supports various browser-specific input
   * formats including File objects, data URLs, and base64 strings.
   *
   * @param images - Array of images to process
   * @param options - Optional processing configuration
   * @returns Promise resolving to OCR results with browser-optimized processing
   *
   * @throws {OCRDependencyError} If browser environment is incompatible
   * @throws {OCRProcessingError} If OCR processing fails
   *
   * @example File input processing
   * ```typescript
   * const fileInput = document.getElementById('imageFile');
   * const file = fileInput.files[0];
   * const result = await provider.performOCR([
   *   { data: file }
   * ], {
   *   language: 'eng',
   *   timeout: 30000 // Browser timeout
   * });
   * ```
   *
   * @example Canvas data processing
   * ```typescript
   * const canvas = document.getElementById('canvas');
   * const dataURL = canvas.toDataURL('image/png');
   * const result = await provider.performOCR([
   *   { data: dataURL }
   * ]);
   * ```
   */
  async performOCR(images, options) {
    if (!images || images.length === 0) {
      return {
        text: "",
        confidence: 0,
        detections: [],
        metadata: {
          processingTime: 0,
          provider: this.name
        }
      };
    }
    const dependencyCheck = await this.checkDependencies();
    if (!dependencyCheck.available) {
      throw new OCRDependencyError(
        this.name,
        dependencyCheck.error || "Dependencies not available"
      );
    }
    const startTime = Date.now();
    let ocrText = "";
    let totalConfidence = 0;
    let detectionCount = 0;
    const allDetections = [];
    try {
      const language = this.mapLanguageCode(options?.language || "eng");
      const worker = await this.getWorker(language);
      for (const image of images) {
        try {
          let imageData;
          if (!image.data) {
            continue;
          }
          if (image.data instanceof Uint8Array) {
            imageData = image.data;
          } else if (typeof Buffer !== "undefined" && image.data.constructor?.name === "Buffer") {
            imageData = new Uint8Array(image.data);
          } else if (typeof image.data === "string") {
            if (image.data.startsWith("data:")) {
              imageData = image.data;
            } else {
              try {
                const binaryString = atob(image.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                imageData = bytes;
              } catch {
                continue;
              }
            }
          } else {
            continue;
          }
          const result = await worker.recognize(imageData);
          if (result?.data) {
            const text = result.data.text?.trim() || "";
            if (text) {
              ocrText += `${text} `;
              const confidence = result.data.confidence || 0;
              totalConfidence += confidence;
              detectionCount++;
              if (result.data.words) {
                for (const word of result.data.words) {
                  if (word.text?.trim()) {
                    allDetections.push({
                      text: word.text,
                      confidence: word.confidence || 0,
                      boundingBox: word.bbox ? {
                        x: word.bbox.x0,
                        y: word.bbox.y0,
                        width: word.bbox.x1 - word.bbox.x0,
                        height: word.bbox.y1 - word.bbox.y0
                      } : void 0
                    });
                  }
                }
              } else {
                allDetections.push({
                  text,
                  confidence,
                  boundingBox: void 0
                });
              }
            }
          }
        } catch (imageError) {
          console.warn(
            "Web OCR failed to process image:",
            imageError.message || imageError
          );
        }
      }
    } catch (error) {
      const processingTime2 = Date.now() - startTime;
      console.error("Web OCR processing failed:", error.message || error);
      throw new OCRProcessingError(
        this.name,
        `Processing failed: ${error.message || error}`,
        { ...error, processingTime: processingTime2 }
      );
    }
    const processingTime = Date.now() - startTime;
    const averageConfidence = detectionCount > 0 ? totalConfidence / detectionCount : 0;
    return {
      text: ocrText.trim(),
      confidence: averageConfidence,
      detections: allDetections,
      metadata: {
        processingTime,
        provider: this.name,
        language: options?.language,
        environment: "browser"
      }
    };
  }
  /**
   * Map common language codes to Tesseract.js-compatible codes for browser use.
   *
   * Converts standard language codes to Tesseract format, with consideration
   * for browser-specific language model availability and download sizes.
   *
   * @param code - Input language code
   * @returns Tesseract.js-compatible language code
   * @private
   */
  mapLanguageCode(code) {
    const langMap = {
      en: "eng",
      zh: "chi_sim",
      "zh-cn": "chi_sim",
      "zh-tw": "chi_tra",
      ja: "jpn",
      ko: "kor",
      ar: "ara",
      hi: "hin",
      ru: "rus",
      es: "spa",
      fr: "fra",
      de: "deu",
      it: "ita",
      pt: "por",
      pl: "pol",
      nl: "nld",
      tr: "tur"
    };
    return langMap[code.toLowerCase()] || code;
  }
  /**
   * Get array of language codes supported in browser environments.
   *
   * Returns commonly used languages that work well in browsers with
   * reasonable model download sizes and good performance characteristics.
   *
   * @returns Array of browser-optimized language codes
   *
   * @example
   * ```typescript
   * const languages = provider.getSupportedLanguages();
   * console.log('Browser supports:', languages);
   * // ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'ara', ...]
   * ```
   */
  getSupportedLanguages() {
    return [
      "eng",
      "chi_sim",
      "chi_tra",
      "jpn",
      "kor",
      "ara",
      "hin",
      "rus",
      "spa",
      "fra",
      "deu",
      "ita",
      "por",
      "nld",
      "tur",
      "pol"
    ];
  }
  /**
   * Check and return the capabilities of the Web OCR provider.
   *
   * Returns browser-specific capabilities including memory limitations,
   * supported formats, and special features available in web environments.
   *
   * @returns Promise resolving to browser-optimized capabilities
   *
   * @example
   * ```typescript
   * const caps = await provider.checkCapabilities();
   * console.log('Max image size:', caps.maxImageSize); // Browser memory limit
   * console.log('Browser features:', caps.providerSpecific);
   * ```
   */
  async checkCapabilities() {
    const deps = await this.checkDependencies();
    return {
      canPerformOCR: deps.available,
      supportedLanguages: this.getSupportedLanguages(),
      maxImageSize: 4096,
      // Browser memory limitations
      supportedFormats: ["png", "jpg", "jpeg", "bmp", "webp"],
      hasConfidenceScores: true,
      hasBoundingBoxes: true,
      providerSpecific: {
        webAssembly: true,
        browserOnly: true,
        progressCallbacks: true,
        clientSideProcessing: true,
        noServerRequired: true
      }
    };
  }
  /**
   * Check if Web OCR dependencies are available in the current browser.
   *
   * Performs comprehensive browser compatibility checks including
   * WebAssembly support, Web Workers availability, and Tesseract.js
   * module loading. Includes timeout protection for network-dependent checks.
   *
   * @returns Promise resolving to detailed dependency check results
   *
   * @example
   * ```typescript
   * const deps = await provider.checkDependencies();
   * if (deps.available) {
   *   console.log('Browser is ready for OCR processing');
   * } else {
   *   console.log('Browser compatibility issue:', deps.error);
   *   console.log('Details:', deps.details);
   * }
   * ```
   */
  async checkDependencies() {
    const result = {
      available: false,
      details: {
        browserEnvironment: false,
        tesseractJs: false,
        webAssembly: false,
        worker: false
      }
    };
    try {
      const globalObj = globalThis;
      if (typeof globalObj.window === "undefined" || typeof globalObj.document === "undefined") {
        result.error = "WebOCRProvider requires a browser environment";
        return result;
      }
      result.details.browserEnvironment = true;
      if (typeof globalObj.WebAssembly === "undefined") {
        result.error = "WebAssembly not supported in this browser";
        return result;
      }
      result.details.webAssembly = true;
      const tesseract = await this.loadTesseract();
      result.details.tesseractJs = true;
      const workerCreationPromise = tesseract.createWorker("eng");
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Worker creation timeout after 15 seconds")),
          15e3
        );
      });
      try {
        const testWorker = await Promise.race([
          workerCreationPromise,
          timeoutPromise
        ]);
        result.details.worker = true;
        result.available = true;
        if (testWorker && typeof testWorker.terminate === "function") {
          try {
            await testWorker.terminate();
          } catch {
          }
        }
      } catch (workerError) {
        result.error = `Tesseract worker creation failed: ${workerError.message}`;
        result.details.worker = false;
        return result;
      }
      return result;
    } catch (error) {
      const errorMessage = error.message || error.toString();
      result.error = `Web OCR initialization failed: ${errorMessage}`;
      return result;
    }
  }
  /**
   * Clean up all Web Workers and browser resources.
   *
   * Terminates all cached workers and releases browser resources
   * including memory used by WebAssembly modules and language models.
   * Important for preventing memory leaks in long-running web applications.
   *
   * @example
   * ```typescript
   * const provider = new WebOCRProvider();
   * try {
   *   await provider.performOCR(images);
   * } finally {
   *   await provider.cleanup();
   * }
   * ```
   *
   * @example Page unload cleanup
   * ```typescript
   * window.addEventListener('beforeunload', async () => {
   *   await provider.cleanup();
   * });
   * ```
   */
  async cleanup() {
    const cleanupPromises = [];
    for (const [language, worker] of this.workers) {
      if (worker && typeof worker.terminate === "function") {
        cleanupPromises.push(
          worker.terminate().catch((error) => {
            console.warn(
              `Failed to terminate Web OCR worker for ${language}:`,
              error
            );
          })
        );
      }
    }
    if (cleanupPromises.length > 0) {
      await Promise.allSettled(cleanupPromises);
    }
    this.workers.clear();
  }
}
export {
  WebOCRProvider
};
//# sourceMappingURL=web-ocr-Dkpjv61E.js.map
