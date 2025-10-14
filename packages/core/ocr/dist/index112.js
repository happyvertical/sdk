import { __exports as tensorUtilsImpl } from "./index119.js";
import { __require as requireTensorImpl } from "./index98.js";
var hasRequiredTensorUtilsImpl;
function requireTensorUtilsImpl() {
  if (hasRequiredTensorUtilsImpl) return tensorUtilsImpl;
  hasRequiredTensorUtilsImpl = 1;
  Object.defineProperty(tensorUtilsImpl, "__esModule", { value: true });
  tensorUtilsImpl.tensorReshape = tensorUtilsImpl.calculateSize = void 0;
  const tensor_impl_js_1 = requireTensorImpl();
  const calculateSize = (dims) => {
    let size = 1;
    for (let i = 0; i < dims.length; i++) {
      const dim = dims[i];
      if (typeof dim !== "number" || !Number.isSafeInteger(dim)) {
        throw new TypeError(`dims[${i}] must be an integer, got: ${dim}`);
      }
      if (dim < 0) {
        throw new RangeError(`dims[${i}] must be a non-negative integer, got: ${dim}`);
      }
      size *= dim;
    }
    return size;
  };
  tensorUtilsImpl.calculateSize = calculateSize;
  const tensorReshape = (tensor, dims) => {
    switch (tensor.location) {
      case "cpu":
        return new tensor_impl_js_1.Tensor(tensor.type, tensor.data, dims);
      case "cpu-pinned":
        return new tensor_impl_js_1.Tensor({
          location: "cpu-pinned",
          data: tensor.data,
          type: tensor.type,
          dims
        });
      case "texture":
        return new tensor_impl_js_1.Tensor({
          location: "texture",
          texture: tensor.texture,
          type: tensor.type,
          dims
        });
      case "gpu-buffer":
        return new tensor_impl_js_1.Tensor({
          location: "gpu-buffer",
          gpuBuffer: tensor.gpuBuffer,
          type: tensor.type,
          dims
        });
      case "ml-tensor":
        return new tensor_impl_js_1.Tensor({
          location: "ml-tensor",
          mlTensor: tensor.mlTensor,
          type: tensor.type,
          dims
        });
      default:
        throw new Error(`tensorReshape: tensor location ${tensor.location} is not supported`);
    }
  };
  tensorUtilsImpl.tensorReshape = tensorReshape;
  return tensorUtilsImpl;
}
export {
  requireTensorUtilsImpl as __require
};
//# sourceMappingURL=index112.js.map
