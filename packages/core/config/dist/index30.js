import { __require as requireCallsites } from "./index59.js";
var parentModule;
var hasRequiredParentModule;
function requireParentModule() {
  if (hasRequiredParentModule) return parentModule;
  hasRequiredParentModule = 1;
  const callsites = requireCallsites();
  parentModule = (filepath) => {
    const stacks = callsites();
    if (!filepath) {
      return stacks[2].getFileName();
    }
    let seenVal = false;
    stacks.shift();
    for (const stack of stacks) {
      const parentFilepath = stack.getFileName();
      if (typeof parentFilepath !== "string") {
        continue;
      }
      if (parentFilepath === filepath) {
        seenVal = true;
        continue;
      }
      if (parentFilepath === "module.js") {
        continue;
      }
      if (seenVal && parentFilepath !== filepath) {
        return parentFilepath;
      }
    }
  };
  return parentModule;
}
export {
  requireParentModule as __require
};
//# sourceMappingURL=index30.js.map
