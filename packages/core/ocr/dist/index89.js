import { __exports as tensorImpl } from "./index107.js";
import { __require as requireTensorConversionImpl } from "./index108.js";
import { __require as requireTensorFactoryImpl } from "./index109.js";
import { __require as requireTensorImplTypeMapping } from "./index110.js";
import { __require as requireTensorUtilsImpl } from "./index111.js";
var hasRequiredTensorImpl;
function requireTensorImpl() {
  if (hasRequiredTensorImpl) return tensorImpl;
  hasRequiredTensorImpl = 1;
  Object.defineProperty(tensorImpl, "__esModule", { value: true });
  tensorImpl.Tensor = void 0;
  const tensor_conversion_impl_js_1 = requireTensorConversionImpl();
  const tensor_factory_impl_js_1 = requireTensorFactoryImpl();
  const tensor_impl_type_mapping_js_1 = requireTensorImplTypeMapping();
  const tensor_utils_impl_js_1 = requireTensorUtilsImpl();
  class Tensor {
    /**
     * implementation.
     */
    constructor(arg0, arg1, arg2) {
      (0, tensor_impl_type_mapping_js_1.checkTypedArray)();
      let type;
      let dims;
      if (typeof arg0 === "object" && "location" in arg0) {
        this.dataLocation = arg0.location;
        type = arg0.type;
        dims = arg0.dims;
        switch (arg0.location) {
          case "cpu-pinned": {
            const expectedTypedArrayConstructor = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(type);
            if (!expectedTypedArrayConstructor) {
              throw new TypeError(`unsupported type "${type}" to create tensor from pinned buffer`);
            }
            if (!(arg0.data instanceof expectedTypedArrayConstructor)) {
              throw new TypeError(`buffer should be of type ${expectedTypedArrayConstructor.name}`);
            }
            this.cpuData = arg0.data;
            break;
          }
          case "texture": {
            if (type !== "float32") {
              throw new TypeError(`unsupported type "${type}" to create tensor from texture`);
            }
            this.gpuTextureData = arg0.texture;
            this.downloader = arg0.download;
            this.disposer = arg0.dispose;
            break;
          }
          case "gpu-buffer": {
            if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
              throw new TypeError(`unsupported type "${type}" to create tensor from gpu buffer`);
            }
            this.gpuBufferData = arg0.gpuBuffer;
            this.downloader = arg0.download;
            this.disposer = arg0.dispose;
            break;
          }
          case "ml-tensor": {
            if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint64" && type !== "int8" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
              throw new TypeError(`unsupported type "${type}" to create tensor from MLTensor`);
            }
            this.mlTensorData = arg0.mlTensor;
            this.downloader = arg0.download;
            this.disposer = arg0.dispose;
            break;
          }
          default:
            throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
        }
      } else {
        let data;
        let maybeDims;
        if (typeof arg0 === "string") {
          type = arg0;
          maybeDims = arg2;
          if (arg0 === "string") {
            if (!Array.isArray(arg1)) {
              throw new TypeError("A string tensor's data must be a string array.");
            }
            data = arg1;
          } else {
            const typedArrayConstructor = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(arg0);
            if (typedArrayConstructor === void 0) {
              throw new TypeError(`Unsupported tensor type: ${arg0}.`);
            }
            if (Array.isArray(arg1)) {
              if (arg0 === "float16" && typedArrayConstructor === Uint16Array || arg0 === "uint4" || arg0 === "int4") {
                throw new TypeError(`Creating a ${arg0} tensor from number array is not supported. Please use ${typedArrayConstructor.name} as data.`);
              } else if (arg0 === "uint64" || arg0 === "int64") {
                data = typedArrayConstructor.from(arg1, BigInt);
              } else {
                data = typedArrayConstructor.from(arg1);
              }
            } else if (arg1 instanceof typedArrayConstructor) {
              data = arg1;
            } else if (arg1 instanceof Uint8ClampedArray) {
              if (arg0 === "uint8") {
                data = Uint8Array.from(arg1);
              } else {
                throw new TypeError(`A Uint8ClampedArray tensor's data must be type of uint8`);
              }
            } else if (arg0 === "float16" && arg1 instanceof Uint16Array && typedArrayConstructor !== Uint16Array) {
              data = new globalThis.Float16Array(arg1.buffer, arg1.byteOffset, arg1.length);
            } else {
              throw new TypeError(`A ${type} tensor's data must be type of ${typedArrayConstructor}`);
            }
          }
        } else {
          maybeDims = arg1;
          if (Array.isArray(arg0)) {
            if (arg0.length === 0) {
              throw new TypeError("Tensor type cannot be inferred from an empty array.");
            }
            const firstElementType = typeof arg0[0];
            if (firstElementType === "string") {
              type = "string";
              data = arg0;
            } else if (firstElementType === "boolean") {
              type = "bool";
              data = Uint8Array.from(arg0);
            } else {
              throw new TypeError(`Invalid element type of data array: ${firstElementType}.`);
            }
          } else if (arg0 instanceof Uint8ClampedArray) {
            type = "uint8";
            data = Uint8Array.from(arg0);
          } else {
            const mappedType = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.get(arg0.constructor);
            if (mappedType === void 0) {
              throw new TypeError(`Unsupported type for tensor data: ${arg0.constructor}.`);
            }
            type = mappedType;
            data = arg0;
          }
        }
        if (maybeDims === void 0) {
          maybeDims = [data.length];
        } else if (!Array.isArray(maybeDims)) {
          throw new TypeError("A tensor's dims must be a number array");
        }
        dims = maybeDims;
        this.cpuData = data;
        this.dataLocation = "cpu";
      }
      const size = (0, tensor_utils_impl_js_1.calculateSize)(dims);
      if (this.cpuData && size !== this.cpuData.length) {
        if ((type === "uint4" || type === "int4") && Math.ceil(size / 2) === this.cpuData.length) ;
        else {
          throw new Error(`Tensor's size(${size}) does not match data length(${this.cpuData.length}).`);
        }
      }
      this.type = type;
      this.dims = dims;
      this.size = size;
    }
    // #endregion
    // #region factory
    static async fromImage(image, options) {
      return (0, tensor_factory_impl_js_1.tensorFromImage)(image, options);
    }
    static fromTexture(texture, options) {
      return (0, tensor_factory_impl_js_1.tensorFromTexture)(texture, options);
    }
    static fromGpuBuffer(gpuBuffer, options) {
      return (0, tensor_factory_impl_js_1.tensorFromGpuBuffer)(gpuBuffer, options);
    }
    static fromMLTensor(mlTensor, options) {
      return (0, tensor_factory_impl_js_1.tensorFromMLTensor)(mlTensor, options);
    }
    static fromPinnedBuffer(type, buffer, dims) {
      return (0, tensor_factory_impl_js_1.tensorFromPinnedBuffer)(type, buffer, dims);
    }
    // #endregion
    // #region conversions
    toDataURL(options) {
      return (0, tensor_conversion_impl_js_1.tensorToDataURL)(this, options);
    }
    toImageData(options) {
      return (0, tensor_conversion_impl_js_1.tensorToImageData)(this, options);
    }
    // #endregion
    // #region properties
    get data() {
      this.ensureValid();
      if (!this.cpuData) {
        throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
      }
      return this.cpuData;
    }
    get location() {
      return this.dataLocation;
    }
    get texture() {
      this.ensureValid();
      if (!this.gpuTextureData) {
        throw new Error("The data is not stored as a WebGL texture.");
      }
      return this.gpuTextureData;
    }
    get gpuBuffer() {
      this.ensureValid();
      if (!this.gpuBufferData) {
        throw new Error("The data is not stored as a WebGPU buffer.");
      }
      return this.gpuBufferData;
    }
    get mlTensor() {
      this.ensureValid();
      if (!this.mlTensorData) {
        throw new Error("The data is not stored as a WebNN MLTensor.");
      }
      return this.mlTensorData;
    }
    // #endregion
    // #region methods
    async getData(releaseData) {
      this.ensureValid();
      switch (this.dataLocation) {
        case "cpu":
        case "cpu-pinned":
          return this.data;
        case "texture":
        case "gpu-buffer":
        case "ml-tensor": {
          if (!this.downloader) {
            throw new Error("The current tensor is not created with a specified data downloader.");
          }
          if (this.isDownloading) {
            throw new Error("The current tensor is being downloaded.");
          }
          try {
            this.isDownloading = true;
            const data = await this.downloader();
            this.downloader = void 0;
            this.dataLocation = "cpu";
            this.cpuData = data;
            if (releaseData && this.disposer) {
              this.disposer();
              this.disposer = void 0;
            }
            return data;
          } finally {
            this.isDownloading = false;
          }
        }
        default:
          throw new Error(`cannot get data from location: ${this.dataLocation}`);
      }
    }
    dispose() {
      if (this.isDownloading) {
        throw new Error("The current tensor is being downloaded.");
      }
      if (this.disposer) {
        this.disposer();
        this.disposer = void 0;
      }
      this.cpuData = void 0;
      this.gpuTextureData = void 0;
      this.gpuBufferData = void 0;
      this.mlTensorData = void 0;
      this.downloader = void 0;
      this.isDownloading = void 0;
      this.dataLocation = "none";
    }
    // #endregion
    // #region tensor utilities
    ensureValid() {
      if (this.dataLocation === "none") {
        throw new Error("The tensor is disposed.");
      }
    }
    reshape(dims) {
      this.ensureValid();
      if (this.downloader || this.disposer) {
        throw new Error("Cannot reshape a tensor that owns GPU resource.");
      }
      return (0, tensor_utils_impl_js_1.tensorReshape)(this, dims);
    }
  }
  tensorImpl.Tensor = Tensor;
  return tensorImpl;
}
export {
  requireTensorImpl as __require
};
//# sourceMappingURL=index89.js.map
