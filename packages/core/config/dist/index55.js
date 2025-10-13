import { __require as requireType } from "./index37.js";
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  var Type = requireType();
  seq = new Type("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
export {
  requireSeq as __require
};
//# sourceMappingURL=index55.js.map
