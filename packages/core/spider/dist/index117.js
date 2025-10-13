var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  function isValidLastEventId(value) {
    return value.indexOf("\0") === -1;
  }
  function isASCIINumber(value) {
    if (value.length === 0) return false;
    for (let i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) < 48 || value.charCodeAt(i) > 57) return false;
    }
    return true;
  }
  util = {
    isValidLastEventId,
    isASCIINumber
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index117.js.map
