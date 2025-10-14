import { __require as requireType } from "./index37.js";
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  var Type = requireType();
  str = new Type("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
export {
  requireStr as __require
};
//# sourceMappingURL=index56.js.map
