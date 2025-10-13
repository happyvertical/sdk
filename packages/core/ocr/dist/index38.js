import require$$1 from "zlib";
import { __require as requireConstants } from "./index34.js";
import { __require as requirePacker } from "./index35.js";
var packerSync;
var hasRequiredPackerSync;
function requirePackerSync() {
  if (hasRequiredPackerSync) return packerSync;
  hasRequiredPackerSync = 1;
  let hasSyncZlib = true;
  let zlib = require$$1;
  if (!zlib.deflateSync) {
    hasSyncZlib = false;
  }
  let constants = requireConstants();
  let Packer = requirePacker();
  packerSync = function(metaData, opt) {
    if (!hasSyncZlib) {
      throw new Error(
        "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
      );
    }
    let options = opt || {};
    let packer = new Packer(options);
    let chunks = [];
    chunks.push(Buffer.from(constants.PNG_SIGNATURE));
    chunks.push(packer.packIHDR(metaData.width, metaData.height));
    if (metaData.gamma) {
      chunks.push(packer.packGAMA(metaData.gamma));
    }
    let filteredData = packer.filterData(
      metaData.data,
      metaData.width,
      metaData.height
    );
    let compressedData = zlib.deflateSync(
      filteredData,
      packer.getDeflateOptions()
    );
    filteredData = null;
    if (!compressedData || !compressedData.length) {
      throw new Error("bad png - invalid compressed data response");
    }
    chunks.push(packer.packIDAT(compressedData));
    chunks.push(packer.packIEND());
    return Buffer.concat(chunks);
  };
  return packerSync;
}
export {
  requirePackerSync as __require
};
//# sourceMappingURL=index38.js.map
