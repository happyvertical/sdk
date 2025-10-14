import { __require as requireFailsafe } from "./index40.js";
import { __require as require_null } from "./index48.js";
import { __require as requireBool } from "./index52.js";
import { __require as requireInt } from "./index53.js";
import { __require as requireFloat } from "./index46.js";
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
//# sourceMappingURL=index41.js.map
