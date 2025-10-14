import { __exports as inferenceSession } from "./index95.js";
import { __require as requireInferenceSessionImpl } from "./index96.js";
var hasRequiredInferenceSession;
function requireInferenceSession() {
  if (hasRequiredInferenceSession) return inferenceSession;
  hasRequiredInferenceSession = 1;
  Object.defineProperty(inferenceSession, "__esModule", { value: true });
  inferenceSession.InferenceSession = void 0;
  const inference_session_impl_js_1 = requireInferenceSessionImpl();
  inferenceSession.InferenceSession = inference_session_impl_js_1.InferenceSession;
  return inferenceSession;
}
export {
  requireInferenceSession as __require
};
//# sourceMappingURL=index65.js.map
