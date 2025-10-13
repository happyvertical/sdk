import fs from "node:fs/promises";
import { Ocr as Ocr$1 } from "./index10.js";
import { registerBackend } from "./index11.js";
import { splitIntoLineImages } from "./index12.js";
import defaultModels from "./index13.js";
import { d as distExports } from "./index14.js";
import { FileUtils } from "./index15.js";
import { ImageRaw } from "./index16.js";
registerBackend({
  FileUtils,
  ImageRaw,
  InferenceSession: distExports.InferenceSession,
  splitIntoLineImages,
  defaultModels
});
class Ocr extends Ocr$1 {
  static async create(options = {}) {
    const ocr = await Ocr$1.create(options);
    if (options.debugOutputDir) {
      await fs.mkdir(options.debugOutputDir, { recursive: true });
    }
    return ocr;
  }
}
export {
  Ocr as default,
  registerBackend
};
//# sourceMappingURL=index7.js.map
