import { __exports as tensorConversionImpl } from "./index116.js";
var hasRequiredTensorConversionImpl;
function requireTensorConversionImpl() {
  if (hasRequiredTensorConversionImpl) return tensorConversionImpl;
  hasRequiredTensorConversionImpl = 1;
  Object.defineProperty(tensorConversionImpl, "__esModule", { value: true });
  tensorConversionImpl.tensorToImageData = tensorConversionImpl.tensorToDataURL = void 0;
  const tensorToDataURL = (tensor, options) => {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
    canvas.width = tensor.dims[3];
    canvas.height = tensor.dims[2];
    const pixels2DContext = canvas.getContext("2d");
    if (pixels2DContext != null) {
      let width;
      let height;
      if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
        width = tensor.dims[2];
        height = tensor.dims[3];
      } else {
        width = tensor.dims[3];
        height = tensor.dims[2];
      }
      const inputformat = options?.format !== void 0 ? options.format : "RGB";
      const norm = options?.norm;
      let normMean;
      let normBias;
      if (norm === void 0 || norm.mean === void 0) {
        normMean = [255, 255, 255, 255];
      } else {
        if (typeof norm.mean === "number") {
          normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
        } else {
          normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 0];
          if (norm.mean[3] !== void 0) {
            normMean[3] = norm.mean[3];
          }
        }
      }
      if (norm === void 0 || norm.bias === void 0) {
        normBias = [0, 0, 0, 0];
      } else {
        if (typeof norm.bias === "number") {
          normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
        } else {
          normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
          if (norm.bias[3] !== void 0) {
            normBias[3] = norm.bias[3];
          }
        }
      }
      const stride = height * width;
      let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
      if (inputformat === "RGBA") {
        rTensorPointer = 0;
        gTensorPointer = stride;
        bTensorPointer = stride * 2;
        aTensorPointer = stride * 3;
      } else if (inputformat === "RGB") {
        rTensorPointer = 0;
        gTensorPointer = stride;
        bTensorPointer = stride * 2;
      } else if (inputformat === "RBG") {
        rTensorPointer = 0;
        bTensorPointer = stride;
        gTensorPointer = stride * 2;
      }
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          const R = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
          const G = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
          const B = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
          const A = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
          pixels2DContext.fillStyle = "rgba(" + R + "," + G + "," + B + "," + A + ")";
          pixels2DContext.fillRect(j, i, 1, 1);
        }
      }
      if ("toDataURL" in canvas) {
        return canvas.toDataURL();
      } else {
        throw new Error("toDataURL is not supported");
      }
    } else {
      throw new Error("Can not access image data");
    }
  };
  tensorConversionImpl.tensorToDataURL = tensorToDataURL;
  const tensorToImageData = (tensor, options) => {
    const pixels2DContext = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d");
    let image;
    if (pixels2DContext != null) {
      let width;
      let height;
      let channels;
      if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
        width = tensor.dims[2];
        height = tensor.dims[1];
        channels = tensor.dims[3];
      } else {
        width = tensor.dims[3];
        height = tensor.dims[2];
        channels = tensor.dims[1];
      }
      const inputformat = options !== void 0 ? options.format !== void 0 ? options.format : "RGB" : "RGB";
      const norm = options?.norm;
      let normMean;
      let normBias;
      if (norm === void 0 || norm.mean === void 0) {
        normMean = [255, 255, 255, 255];
      } else {
        if (typeof norm.mean === "number") {
          normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
        } else {
          normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 255];
          if (norm.mean[3] !== void 0) {
            normMean[3] = norm.mean[3];
          }
        }
      }
      if (norm === void 0 || norm.bias === void 0) {
        normBias = [0, 0, 0, 0];
      } else {
        if (typeof norm.bias === "number") {
          normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
        } else {
          normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
          if (norm.bias[3] !== void 0) {
            normBias[3] = norm.bias[3];
          }
        }
      }
      const stride = height * width;
      if (options !== void 0) {
        if (options.format !== void 0 && channels === 4 && options.format !== "RGBA" || channels === 3 && options.format !== "RGB" && options.format !== "BGR") {
          throw new Error("Tensor format doesn't match input tensor dims");
        }
      }
      const step = 4;
      let rImagePointer = 0, gImagePointer = 1, bImagePointer = 2, aImagePointer = 3;
      let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
      if (inputformat === "RGBA") {
        rTensorPointer = 0;
        gTensorPointer = stride;
        bTensorPointer = stride * 2;
        aTensorPointer = stride * 3;
      } else if (inputformat === "RGB") {
        rTensorPointer = 0;
        gTensorPointer = stride;
        bTensorPointer = stride * 2;
      } else if (inputformat === "RBG") {
        rTensorPointer = 0;
        bTensorPointer = stride;
        gTensorPointer = stride * 2;
      }
      image = pixels2DContext.createImageData(width, height);
      for (let i = 0; i < height * width; rImagePointer += step, gImagePointer += step, bImagePointer += step, aImagePointer += step, i++) {
        image.data[rImagePointer] = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
        image.data[gImagePointer] = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
        image.data[bImagePointer] = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
        image.data[aImagePointer] = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
      }
    } else {
      throw new Error("Can not access image data");
    }
    return image;
  };
  tensorConversionImpl.tensorToImageData = tensorToImageData;
  return tensorConversionImpl;
}
export {
  requireTensorConversionImpl as __require
};
//# sourceMappingURL=index108.js.map
