import { __exports as tensor } from "./index88.js";
import { __require as requireTensorImpl } from "./index89.js";
var hasRequiredTensor;
function requireTensor() {
  if (hasRequiredTensor) return tensor;
  hasRequiredTensor = 1;
  Object.defineProperty(tensor, "__esModule", { value: true });
  tensor.Tensor = void 0;
  const tensor_impl_js_1 = requireTensorImpl();
  tensor.Tensor = tensor_impl_js_1.Tensor;
  return tensor;
}
export {
  requireTensor as __require
};
//# sourceMappingURL=index53.js.map
