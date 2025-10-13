import { __require as requireCore } from "./index42.js";
import { __require as requireTimestamp } from "./index51.js";
import { __require as requireMerge } from "./index54.js";
import { __require as requireBinary } from "./index45.js";
import { __require as requireOmap } from "./index55.js";
import { __require as requirePairs } from "./index49.js";
import { __require as requireSet } from "./index50.js";
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
export {
  require_default as __require
};
//# sourceMappingURL=index43.js.map
