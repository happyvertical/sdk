import require$$0 from "node:assert";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireUtil$1 } from "./index88.js";
var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  const assert = require$$0;
  const { URLSerializer } = requireDataUrl();
  const { isValidHeaderName } = requireUtil$1();
  function urlEquals(A, B, excludeFragment = false) {
    const serializedA = URLSerializer(A, excludeFragment);
    const serializedB = URLSerializer(B, excludeFragment);
    return serializedA === serializedB;
  }
  function getFieldValues(header) {
    assert(header !== null);
    const values = [];
    for (let value of header.split(",")) {
      value = value.trim();
      if (isValidHeaderName(value)) {
        values.push(value);
      }
    }
    return values;
  }
  util = {
    urlEquals,
    getFieldValues
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index116.js.map
