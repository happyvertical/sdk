import { __require as requireEncoder } from "./index18.js";
import { __require as requireDecoder } from "./index19.js";
var jpegJs;
var hasRequiredJpegJs;
function requireJpegJs() {
  if (hasRequiredJpegJs) return jpegJs;
  hasRequiredJpegJs = 1;
  var encode = requireEncoder(), decode = requireDecoder();
  jpegJs = {
    encode,
    decode
  };
  return jpegJs;
}
export {
  requireJpegJs as __require
};
//# sourceMappingURL=index17.js.map
