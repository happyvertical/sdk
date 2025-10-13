import invariant from "./index113.js";
import { defaultModels, InferenceSession, ImageRaw, splitIntoLineImages } from "./index11.js";
import { ModelBase } from "./index114.js";
const BASE_SIZE = 32;
class Detection extends ModelBase {
  static async create({ models, onnxOptions = {}, ...restOptions }) {
    const detectionPath = models?.detectionPath || defaultModels?.detectionPath;
    invariant(detectionPath, "detectionPath is required");
    const model = await InferenceSession.create(detectionPath, onnxOptions);
    return new Detection({ model, options: restOptions });
  }
  async run(path, { onnxOptions = {} } = {}) {
    const image = await ImageRaw.open(path);
    const inputImage = await image.resize(multipleOfBaseSize(image));
    this.debugImage(inputImage, "out1-multiple-of-base-size.jpg");
    const modelData = this.imageToInput(inputImage, {
      // mean: [0.485, 0.456, 0.406],
      // std: [0.229, 0.224, 0.225],
    });
    const modelOutput = await this.runModel({ modelData, onnxOptions });
    const outputImage = outputToImage(modelOutput, 0.03);
    this.debugImage(outputImage, "out2-black-white.jpg");
    const lineImages = await splitIntoLineImages(outputImage, inputImage);
    this.debugBoxImage(inputImage, lineImages, "boxes.jpg");
    return lineImages;
  }
}
function multipleOfBaseSize(image, { maxSize } = {}) {
  let width = image.width;
  let height = image.height;
  if (maxSize && Math.max(width, height) > maxSize) {
    const ratio = width > height ? maxSize / width : maxSize / height;
    width = width * ratio;
    height = height * ratio;
  }
  const newWidth = Math.max(
    // Math.round
    // Math.ceil
    Math.ceil(width / BASE_SIZE) * BASE_SIZE,
    BASE_SIZE
  );
  const newHeight = Math.max(Math.ceil(height / BASE_SIZE) * BASE_SIZE, BASE_SIZE);
  return { width: newWidth, height: newHeight };
}
function outputToImage(output, threshold) {
  const height = output.dims[2];
  const width = output.dims[3];
  const data = new Uint8Array(width * height * 4);
  for (const [outIndex, outValue] of output.data.entries()) {
    const n = outIndex * 4;
    const value = outValue > threshold ? 255 : 0;
    data[n] = value;
    data[n + 1] = value;
    data[n + 2] = value;
    data[n + 3] = 255;
  }
  return new ImageRaw({ data, width, height });
}
export {
  Detection
};
//# sourceMappingURL=index76.js.map
