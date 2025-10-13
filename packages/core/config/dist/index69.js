import { __module as callsites } from "./index76.js";
var hasRequiredCallsites;
function requireCallsites() {
  if (hasRequiredCallsites) return callsites.exports;
  hasRequiredCallsites = 1;
  const callsites$1 = () => {
    const _prepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack2) => stack2;
    const stack = new Error().stack.slice(1);
    Error.prepareStackTrace = _prepareStackTrace;
    return stack;
  };
  callsites.exports = callsites$1;
  callsites.exports.default = callsites$1;
  return callsites.exports;
}
export {
  requireCallsites as __require
};
//# sourceMappingURL=index69.js.map
