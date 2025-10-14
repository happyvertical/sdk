import { __exports as inferenceSessionImpl } from "./index107.js";
import { __require as requireBackendImpl } from "./index90.js";
import { __require as requireTensor } from "./index66.js";
import { __require as requireTrace } from "./index69.js";
var hasRequiredInferenceSessionImpl;
function requireInferenceSessionImpl() {
  if (hasRequiredInferenceSessionImpl) return inferenceSessionImpl;
  hasRequiredInferenceSessionImpl = 1;
  Object.defineProperty(inferenceSessionImpl, "__esModule", { value: true });
  inferenceSessionImpl.InferenceSession = void 0;
  const backend_impl_js_1 = requireBackendImpl();
  const tensor_js_1 = requireTensor();
  const trace_js_1 = requireTrace();
  class InferenceSession {
    constructor(handler) {
      this.handler = handler;
    }
    async run(feeds, arg1, arg2) {
      (0, trace_js_1.TRACE_FUNC_BEGIN)();
      const fetches = {};
      let options = {};
      if (typeof feeds !== "object" || feeds === null || feeds instanceof tensor_js_1.Tensor || Array.isArray(feeds)) {
        throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
      }
      let isFetchesEmpty = true;
      if (typeof arg1 === "object") {
        if (arg1 === null) {
          throw new TypeError("Unexpected argument[1]: cannot be null.");
        }
        if (arg1 instanceof tensor_js_1.Tensor) {
          throw new TypeError("'fetches' cannot be a Tensor");
        }
        if (Array.isArray(arg1)) {
          if (arg1.length === 0) {
            throw new TypeError("'fetches' cannot be an empty array.");
          }
          isFetchesEmpty = false;
          for (const name of arg1) {
            if (typeof name !== "string") {
              throw new TypeError("'fetches' must be a string array or an object.");
            }
            if (this.outputNames.indexOf(name) === -1) {
              throw new RangeError(`'fetches' contains invalid output name: ${name}.`);
            }
            fetches[name] = null;
          }
          if (typeof arg2 === "object" && arg2 !== null) {
            options = arg2;
          } else if (typeof arg2 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
        } else {
          let isFetches = false;
          const arg1Keys = Object.getOwnPropertyNames(arg1);
          for (const name of this.outputNames) {
            if (arg1Keys.indexOf(name) !== -1) {
              const v = arg1[name];
              if (v === null || v instanceof tensor_js_1.Tensor) {
                isFetches = true;
                isFetchesEmpty = false;
                fetches[name] = v;
              }
            }
          }
          if (isFetches) {
            if (typeof arg2 === "object" && arg2 !== null) {
              options = arg2;
            } else if (typeof arg2 !== "undefined") {
              throw new TypeError("'options' must be an object.");
            }
          } else {
            options = arg1;
          }
        }
      } else if (typeof arg1 !== "undefined") {
        throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
      }
      for (const name of this.inputNames) {
        if (typeof feeds[name] === "undefined") {
          throw new Error(`input '${name}' is missing in 'feeds'.`);
        }
      }
      if (isFetchesEmpty) {
        for (const name of this.outputNames) {
          fetches[name] = null;
        }
      }
      const results = await this.handler.run(feeds, fetches, options);
      const returnValue = {};
      for (const key in results) {
        if (Object.hasOwnProperty.call(results, key)) {
          const result = results[key];
          if (result instanceof tensor_js_1.Tensor) {
            returnValue[key] = result;
          } else {
            returnValue[key] = new tensor_js_1.Tensor(result.type, result.data, result.dims);
          }
        }
      }
      (0, trace_js_1.TRACE_FUNC_END)();
      return returnValue;
    }
    async release() {
      return this.handler.dispose();
    }
    static async create(arg0, arg1, arg2, arg3) {
      (0, trace_js_1.TRACE_FUNC_BEGIN)();
      let filePathOrUint8Array;
      let options = {};
      if (typeof arg0 === "string") {
        filePathOrUint8Array = arg0;
        if (typeof arg1 === "object" && arg1 !== null) {
          options = arg1;
        } else if (typeof arg1 !== "undefined") {
          throw new TypeError("'options' must be an object.");
        }
      } else if (arg0 instanceof Uint8Array) {
        filePathOrUint8Array = arg0;
        if (typeof arg1 === "object" && arg1 !== null) {
          options = arg1;
        } else if (typeof arg1 !== "undefined") {
          throw new TypeError("'options' must be an object.");
        }
      } else if (arg0 instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && arg0 instanceof SharedArrayBuffer) {
        const buffer = arg0;
        let byteOffset = 0;
        let byteLength = arg0.byteLength;
        if (typeof arg1 === "object" && arg1 !== null) {
          options = arg1;
        } else if (typeof arg1 === "number") {
          byteOffset = arg1;
          if (!Number.isSafeInteger(byteOffset)) {
            throw new RangeError("'byteOffset' must be an integer.");
          }
          if (byteOffset < 0 || byteOffset >= buffer.byteLength) {
            throw new RangeError(`'byteOffset' is out of range [0, ${buffer.byteLength}).`);
          }
          byteLength = arg0.byteLength - byteOffset;
          if (typeof arg2 === "number") {
            byteLength = arg2;
            if (!Number.isSafeInteger(byteLength)) {
              throw new RangeError("'byteLength' must be an integer.");
            }
            if (byteLength <= 0 || byteOffset + byteLength > buffer.byteLength) {
              throw new RangeError(`'byteLength' is out of range (0, ${buffer.byteLength - byteOffset}].`);
            }
            if (typeof arg3 === "object" && arg3 !== null) {
              options = arg3;
            } else if (typeof arg3 !== "undefined") {
              throw new TypeError("'options' must be an object.");
            }
          } else if (typeof arg2 !== "undefined") {
            throw new TypeError("'byteLength' must be a number.");
          }
        } else if (typeof arg1 !== "undefined") {
          throw new TypeError("'options' must be an object.");
        }
        filePathOrUint8Array = new Uint8Array(buffer, byteOffset, byteLength);
      } else {
        throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
      }
      const [backend, optionsWithValidatedEPs] = await (0, backend_impl_js_1.resolveBackendAndExecutionProviders)(options);
      const handler = await backend.createInferenceSessionHandler(filePathOrUint8Array, optionsWithValidatedEPs);
      (0, trace_js_1.TRACE_FUNC_END)();
      return new InferenceSession(handler);
    }
    startProfiling() {
      this.handler.startProfiling();
    }
    endProfiling() {
      this.handler.endProfiling();
    }
    get inputNames() {
      return this.handler.inputNames;
    }
    get outputNames() {
      return this.handler.outputNames;
    }
    get inputMetadata() {
      return this.handler.inputMetadata;
    }
    get outputMetadata() {
      return this.handler.outputMetadata;
    }
  }
  inferenceSessionImpl.InferenceSession = InferenceSession;
  return inferenceSessionImpl;
}
export {
  requireInferenceSessionImpl as __require
};
//# sourceMappingURL=index94.js.map
