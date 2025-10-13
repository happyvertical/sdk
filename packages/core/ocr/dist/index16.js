import filePath from "node:path";
import { ImageRawBase } from "./index36.js";
import sharp from "sharp";
class ImageRaw extends ImageRawBase {
  #sharp;
  static async open(path) {
    return new ImageRaw(await toImageRaw(sharp(path).ensureAlpha(1)));
  }
  constructor(imageRawData) {
    super(imageRawData);
    this.#sharp = toSharp(imageRawData);
  }
  async write(path) {
    const ext = filePath.extname(path).slice(1);
    return this.#sharp.toFormat(ext).toFile(path);
  }
  async resize(size) {
    return this.#apply(this.#sharp.resize({
      width: size.width,
      height: size.height,
      fit: "contain"
    }));
  }
  async drawBox(lineImages) {
    const svg = `
      <svg width="${this.width}" height="${this.height}">
        ${lineImages.map((lineImage) => {
      const [p1, p2, p3, p4] = lineImage.box;
      return `<polygon points="${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]} ${p4[0]},${p4[1]}"  fill="none" stroke="red" />`;
    }).join("\n")}
      </svg>
    `;
    return this.#apply(this.#sharp.composite([{ input: Buffer.from(svg), left: 0, top: 0 }]));
  }
  async #apply(sharp2) {
    this.#sharp = sharp2;
    const result = await toImageRaw(sharp2);
    this.data = result.data;
    this.width = result.width;
    this.height = result.height;
    return this;
  }
}
async function toImageRaw(sharp2) {
  const result = await sharp2.raw().toBuffer({ resolveWithObject: true });
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height
  };
}
function toSharp(imageRawData) {
  return sharp(imageRawData.data, {
    raw: {
      width: imageRawData.width,
      height: imageRawData.height,
      channels: 4
    }
  });
}
export {
  ImageRaw
};
//# sourceMappingURL=index16.js.map
