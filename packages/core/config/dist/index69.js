import { __exports as lib } from "./index74.js";
import { __require as requireIdentifier } from "./index75.js";
import { __require as requireKeyword } from "./index76.js";
var hasRequiredLib;
function requireLib() {
  if (hasRequiredLib) return lib;
  hasRequiredLib = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    Object.defineProperty(exports, "isIdentifierChar", {
      enumerable: true,
      get: function() {
        return _identifier.isIdentifierChar;
      }
    });
    Object.defineProperty(exports, "isIdentifierName", {
      enumerable: true,
      get: function() {
        return _identifier.isIdentifierName;
      }
    });
    Object.defineProperty(exports, "isIdentifierStart", {
      enumerable: true,
      get: function() {
        return _identifier.isIdentifierStart;
      }
    });
    Object.defineProperty(exports, "isKeyword", {
      enumerable: true,
      get: function() {
        return _keyword.isKeyword;
      }
    });
    Object.defineProperty(exports, "isReservedWord", {
      enumerable: true,
      get: function() {
        return _keyword.isReservedWord;
      }
    });
    Object.defineProperty(exports, "isStrictBindOnlyReservedWord", {
      enumerable: true,
      get: function() {
        return _keyword.isStrictBindOnlyReservedWord;
      }
    });
    Object.defineProperty(exports, "isStrictBindReservedWord", {
      enumerable: true,
      get: function() {
        return _keyword.isStrictBindReservedWord;
      }
    });
    Object.defineProperty(exports, "isStrictReservedWord", {
      enumerable: true,
      get: function() {
        return _keyword.isStrictReservedWord;
      }
    });
    var _identifier = requireIdentifier();
    var _keyword = requireKeyword();
  })(lib);
  return lib;
}
export {
  requireLib as __require
};
//# sourceMappingURL=index69.js.map
