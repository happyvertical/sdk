import { __module as crc } from "./index84.js";
var hasRequiredCrc;
function requireCrc() {
  if (hasRequiredCrc) return crc.exports;
  hasRequiredCrc = 1;
  let crcTable = [];
  (function() {
    for (let i = 0; i < 256; i++) {
      let currentCrc = i;
      for (let j = 0; j < 8; j++) {
        if (currentCrc & 1) {
          currentCrc = 3988292384 ^ currentCrc >>> 1;
        } else {
          currentCrc = currentCrc >>> 1;
        }
      }
      crcTable[i] = currentCrc;
    }
  })();
  let CrcCalculator = crc.exports = function() {
    this._crc = -1;
  };
  CrcCalculator.prototype.write = function(data) {
    for (let i = 0; i < data.length; i++) {
      this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
    }
    return true;
  };
  CrcCalculator.prototype.crc32 = function() {
    return this._crc ^ -1;
  };
  CrcCalculator.crc32 = function(buf) {
    let crc2 = -1;
    for (let i = 0; i < buf.length; i++) {
      crc2 = crcTable[(crc2 ^ buf[i]) & 255] ^ crc2 >>> 8;
    }
    return crc2 ^ -1;
  };
  return crc.exports;
}
export {
  requireCrc as __require
};
//# sourceMappingURL=index53.js.map
