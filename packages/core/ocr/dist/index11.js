let FileUtils = void 0;
let ImageRaw = void 0;
let InferenceSession = void 0;
let splitIntoLineImages = void 0;
let defaultModels = void 0;
function registerBackend(backend) {
  FileUtils = backend.FileUtils;
  ImageRaw = backend.ImageRaw;
  InferenceSession = backend.InferenceSession;
  splitIntoLineImages = backend.splitIntoLineImages;
  defaultModels = backend.defaultModels;
}
export {
  FileUtils,
  ImageRaw,
  InferenceSession,
  defaultModels,
  registerBackend,
  splitIntoLineImages
};
//# sourceMappingURL=index11.js.map
