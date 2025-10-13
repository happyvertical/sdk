var isArrayish;
var hasRequiredIsArrayish;
function requireIsArrayish() {
  if (hasRequiredIsArrayish) return isArrayish;
  hasRequiredIsArrayish = 1;
  isArrayish = function isArrayish2(obj) {
    if (!obj) {
      return false;
    }
    return obj instanceof Array || Array.isArray(obj) || obj.length >= 0 && obj.splice instanceof Function;
  };
  return isArrayish;
}
export {
  requireIsArrayish as __require
};
//# sourceMappingURL=index62.js.map
