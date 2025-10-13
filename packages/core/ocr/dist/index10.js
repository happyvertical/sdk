import { Detection } from "./index75.js";
import { Recognition } from "./index76.js";
let Ocr$1 = class Ocr {
  static async create(options = {}) {
    const detection = await Detection.create(options);
    const recognition = await Recognition.create(options);
    return new Ocr({ detection, recognition });
  }
  #detection;
  #recognition;
  constructor({ detection, recognition }) {
    this.#detection = detection;
    this.#recognition = recognition;
  }
  async detect(image, options = {}) {
    const lineImages = await this.#detection.run(image, options);
    const texts = await this.#recognition.run(lineImages, options);
    return texts;
  }
};
export {
  Ocr$1 as Ocr
};
//# sourceMappingURL=index10.js.map
