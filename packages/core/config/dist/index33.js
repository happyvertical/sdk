import { __exports as build } from "./index65.js";
var hasRequiredBuild;
function requireBuild() {
  if (hasRequiredBuild) return build;
  hasRequiredBuild = 1;
  (function(exports) {
    exports.__esModule = true;
    exports.LinesAndColumns = void 0;
    var LF = "\n";
    var CR = "\r";
    var LinesAndColumns = (
      /** @class */
      (function() {
        function LinesAndColumns2(string) {
          this.string = string;
          var offsets = [0];
          for (var offset = 0; offset < string.length; ) {
            switch (string[offset]) {
              case LF:
                offset += LF.length;
                offsets.push(offset);
                break;
              case CR:
                offset += CR.length;
                if (string[offset] === LF) {
                  offset += LF.length;
                }
                offsets.push(offset);
                break;
              default:
                offset++;
                break;
            }
          }
          this.offsets = offsets;
        }
        LinesAndColumns2.prototype.locationForIndex = function(index) {
          if (index < 0 || index > this.string.length) {
            return null;
          }
          var line = 0;
          var offsets = this.offsets;
          while (offsets[line + 1] <= index) {
            line++;
          }
          var column = index - offsets[line];
          return { line, column };
        };
        LinesAndColumns2.prototype.indexForLocation = function(location) {
          var line = location.line, column = location.column;
          if (line < 0 || line >= this.offsets.length) {
            return null;
          }
          if (column < 0 || column > this.lengthOfLine(line)) {
            return null;
          }
          return this.offsets[line] + column;
        };
        LinesAndColumns2.prototype.lengthOfLine = function(line) {
          var offset = this.offsets[line];
          var nextOffset = line === this.offsets.length - 1 ? this.string.length : this.offsets[line + 1];
          return nextOffset - offset;
        };
        return LinesAndColumns2;
      })()
    );
    exports.LinesAndColumns = LinesAndColumns;
    exports["default"] = LinesAndColumns;
  })(build);
  return build;
}
export {
  requireBuild as __require
};
//# sourceMappingURL=index33.js.map
