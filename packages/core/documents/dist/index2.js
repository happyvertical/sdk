import { getMimeType } from "@have/files";
import { PDFProcessor } from "./index4.js";
const processors = [new PDFProcessor()];
async function fetchDocument(url, options = {}) {
  let type = options.type;
  if (!type) {
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith(".pdf") || urlLower.includes(".pdf?") || urlLower.includes(".pdf#")) {
      type = "application/pdf";
    } else {
      type = getMimeType(url) || "";
    }
  }
  const processor = processors.find((p) => p.supports(type));
  if (!processor) {
    throw new Error(
      `No processor available for document type: ${type}. Supported types: PDF (.pdf, application/pdf)`
    );
  }
  return processor.process(url, options);
}
export {
  fetchDocument as default,
  fetchDocument
};
//# sourceMappingURL=index2.js.map
