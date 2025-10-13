import { __require as requireSchema } from "./index38.js";
import { __require as requireStr } from "./index56.js";
import { __require as requireSeq } from "./index55.js";
import { __require as requireMap } from "./index46.js";
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
//# sourceMappingURL=index39.js.map
