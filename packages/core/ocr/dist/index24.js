import { __exports as pngSync } from "./index36.js";
import { __require as requireParserSync } from "./index37.js";
import { __require as requirePackerSync } from "./index38.js";
var hasRequiredPngSync;
function requirePngSync() {
  if (hasRequiredPngSync) return pngSync;
  hasRequiredPngSync = 1;
  let parse = requireParserSync();
  let pack = requirePackerSync();
  pngSync.read = function(buffer, options) {
    return parse(buffer, options || {});
  };
  pngSync.write = function(png, options) {
    return pack(png, options);
  };
  return pngSync;
}
export {
  requirePngSync as __require
};
//# sourceMappingURL=index24.js.map
