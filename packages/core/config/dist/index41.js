import { __require as requireJson } from "./index40.js";
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
export {
  requireCore as __require
};
//# sourceMappingURL=index41.js.map
