import { commonjsRequire } from "./index28.js";
import require$$0 from "path";
import { __require as requireResolveFrom } from "./index29.js";
import { __require as requireParentModule } from "./index30.js";
var importFresh;
var hasRequiredImportFresh;
function requireImportFresh() {
  if (hasRequiredImportFresh) return importFresh;
  hasRequiredImportFresh = 1;
  const path = require$$0;
  const resolveFrom = requireResolveFrom();
  const parentModule = requireParentModule();
  importFresh = (moduleId) => {
    if (typeof moduleId !== "string") {
      throw new TypeError("Expected a string");
    }
    const parentPath = parentModule(__filename);
    const cwd = parentPath ? path.dirname(parentPath) : __dirname;
    const filePath = resolveFrom(cwd, moduleId);
    const oldModule = require.cache[filePath];
    if (oldModule && oldModule.parent) {
      let i = oldModule.parent.children.length;
      while (i--) {
        if (oldModule.parent.children[i].id === filePath) {
          oldModule.parent.children.splice(i, 1);
        }
      }
    }
    delete require.cache[filePath];
    const parent = require.cache[parentPath];
    return parent === void 0 || parent.require === void 0 ? commonjsRequire(filePath) : parent.require(filePath);
  };
  return importFresh;
}
export {
  requireImportFresh as __require
};
//# sourceMappingURL=index24.js.map
