import { __require as requireFailsafe } from "./index39.js";
import { __require as require_null } from "./index47.js";
import { __require as requireBool } from "./index51.js";
import { __require as requireInt } from "./index52.js";
import { __require as requireFloat } from "./index45.js";
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
export {
  requireJson as __require
};
//# sourceMappingURL=index40.js.map
