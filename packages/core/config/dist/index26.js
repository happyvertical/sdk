import { __exports as jsYaml } from "./index35.js";
import { __require as requireLoader } from "./index36.js";
import { __require as requireDumper } from "./index37.js";
import { __require as requireType } from "./index38.js";
import { __require as requireSchema } from "./index39.js";
import { __require as requireFailsafe } from "./index40.js";
import { __require as requireJson } from "./index41.js";
import { __require as requireCore } from "./index42.js";
import { __require as require_default } from "./index43.js";
import { __require as requireException } from "./index44.js";
import { __require as requireBinary } from "./index45.js";
import { __require as requireFloat } from "./index46.js";
import { __require as requireMap } from "./index47.js";
import { __require as require_null } from "./index48.js";
import { __require as requirePairs } from "./index49.js";
import { __require as requireSet } from "./index50.js";
import { __require as requireTimestamp } from "./index51.js";
import { __require as requireBool } from "./index52.js";
import { __require as requireInt } from "./index53.js";
import { __require as requireMerge } from "./index54.js";
import { __require as requireOmap } from "./index55.js";
import { __require as requireSeq } from "./index56.js";
import { __require as requireStr } from "./index57.js";
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  var loader = requireLoader();
  var dumper = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader.load;
  jsYaml.loadAll = loader.loadAll;
  jsYaml.dump = dumper.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
export {
  requireJsYaml as __require
};
//# sourceMappingURL=index26.js.map
