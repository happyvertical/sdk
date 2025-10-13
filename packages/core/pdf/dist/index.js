import { BasePDFReader } from "./index3.js";
import * as factory from "./index2.js";
import { getPDFReader } from "./index2.js";
import { getAvailableProviders, getProviderInfo, initializeProviders, isProviderAvailable } from "./index2.js";
import { PDFDependencyError, PDFError, PDFUnsupportedError } from "./index4.js";
async function extractTextFromPDF(pdfPath) {
  const reader = await getPDFReader();
  return reader.extractText(pdfPath);
}
async function extractImagesFromPDF(pdfPath) {
  const reader = await getPDFReader();
  const images = await reader.extractImages(pdfPath);
  return images.length > 0 ? images : null;
}
async function performOCROnImages(images) {
  const reader = await getPDFReader();
  const result = await reader.performOCR(images);
  return result.text;
}
async function checkOCRDependencies() {
  const reader = await getPDFReader();
  return reader.checkDependencies();
}
import("./index2.js").then(({ initializeProviders: initializeProviders2 }) => {
  initializeProviders2().catch(() => {
  });
});
export {
  BasePDFReader,
  PDFDependencyError,
  PDFError,
  PDFUnsupportedError,
  checkOCRDependencies,
  factory as default,
  extractImagesFromPDF,
  extractTextFromPDF,
  getAvailableProviders,
  getPDFReader,
  getProviderInfo,
  initializeProviders,
  isProviderAvailable,
  performOCROnImages
};
//# sourceMappingURL=index.js.map
