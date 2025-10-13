import { __exports as merge } from "./index26.js";
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.mergeAll = exports.hasOwn = void 0;
    exports.hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);
    const objToString = Function.prototype.call.bind(Object.prototype.toString);
    function isPlainObject(obj) {
      return objToString(obj) === "[object Object]";
    }
    function merge2(target, source, options) {
      for (const key of Object.keys(source)) {
        const newValue = source[key];
        if ((0, exports.hasOwn)(target, key)) {
          if (Array.isArray(target[key]) && Array.isArray(newValue)) {
            if (options.mergeArrays) {
              target[key].push(...newValue);
              continue;
            }
          } else if (isPlainObject(target[key]) && isPlainObject(newValue)) {
            target[key] = merge2(target[key], newValue, options);
            continue;
          }
        }
        target[key] = newValue;
      }
      return target;
    }
    function mergeAll(objects, options) {
      return objects.reduce((target, source) => merge2(target, source, options), {});
    }
    exports.mergeAll = mergeAll;
  })(merge);
  return merge;
}
export {
  requireMerge as __require
};
//# sourceMappingURL=index16.js.map
