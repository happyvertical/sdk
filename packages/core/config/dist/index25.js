import { __require as requireErrorEx } from "./index31.js";
import { __require as requireJsonParseEvenBetterErrors } from "./index32.js";
import { __require as requireBuild } from "./index33.js";
import { __require as requireLib } from "./index34.js";
var parseJson_1;
var hasRequiredParseJson;
function requireParseJson() {
  if (hasRequiredParseJson) return parseJson_1;
  hasRequiredParseJson = 1;
  const errorEx = requireErrorEx();
  const fallback = requireJsonParseEvenBetterErrors();
  const { default: LinesAndColumns } = requireBuild();
  const { codeFrameColumns } = requireLib();
  const JSONError = errorEx("JSONError", {
    fileName: errorEx.append("in %s"),
    codeFrame: errorEx.append("\n\n%s\n")
  });
  const parseJson = (string, reviver, filename) => {
    if (typeof reviver === "string") {
      filename = reviver;
      reviver = null;
    }
    try {
      try {
        return JSON.parse(string, reviver);
      } catch (error) {
        fallback(string, reviver);
        throw error;
      }
    } catch (error) {
      error.message = error.message.replace(/\n/g, "");
      const indexMatch = error.message.match(/in JSON at position (\d+) while parsing/);
      const jsonError = new JSONError(error);
      if (filename) {
        jsonError.fileName = filename;
      }
      if (indexMatch && indexMatch.length > 0) {
        const lines = new LinesAndColumns(string);
        const index = Number(indexMatch[1]);
        const location = lines.locationForIndex(index);
        const codeFrame = codeFrameColumns(
          string,
          { start: { line: location.line + 1, column: location.column + 1 } },
          { highlightCode: true }
        );
        jsonError.codeFrame = codeFrame;
      }
      throw jsonError;
    }
  };
  parseJson.JSONError = JSONError;
  parseJson_1 = parseJson;
  return parseJson_1;
}
export {
  requireParseJson as __require
};
//# sourceMappingURL=index25.js.map
