import { __require as requireSchema } from "./index39.js";
import { __require as requireStr } from "./index57.js";
import { __require as requireSeq } from "./index56.js";
import { __require as requireMap } from "./index47.js";
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  var Schema = requireSchema();
  failsafe = new Schema({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
export {
  requireFailsafe as __require
};
//# sourceMappingURL=index40.js.map
