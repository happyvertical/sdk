import fs from "node:fs/promises";
import { FileUtilsBase } from "./index35.js";
class FileUtils extends FileUtilsBase {
  static async read(path) {
    return await fs.readFile(path, "utf8");
  }
}
export {
  FileUtils
};
//# sourceMappingURL=index15.js.map
