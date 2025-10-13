import { __module as packerAsync } from "./index43.js";
import require$$0 from "util";
import require$$1 from "stream";
import { __require as requireConstants } from "./index44.js";
import { __require as requirePacker } from "./index45.js";
var hasRequiredPackerAsync;
function requirePackerAsync() {
  if (hasRequiredPackerAsync) return packerAsync.exports;
  hasRequiredPackerAsync = 1;
  let util = require$$0;
  let Stream = require$$1;
  let constants = requireConstants();
  let Packer = requirePacker();
  let PackerAsync = packerAsync.exports = function(opt) {
    Stream.call(this);
    let options = opt || {};
    this._packer = new Packer(options);
    this._deflate = this._packer.createDeflate();
    this.readable = true;
  };
  util.inherits(PackerAsync, Stream);
  PackerAsync.prototype.pack = function(data, width, height, gamma) {
    this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
    this.emit("data", this._packer.packIHDR(width, height));
    if (gamma) {
      this.emit("data", this._packer.packGAMA(gamma));
    }
    let filteredData = this._packer.filterData(data, width, height);
    this._deflate.on("error", this.emit.bind(this, "error"));
    this._deflate.on(
      "data",
      function(compressedData) {
        this.emit("data", this._packer.packIDAT(compressedData));
      }.bind(this)
    );
    this._deflate.on(
      "end",
      function() {
        this.emit("data", this._packer.packIEND());
        this.emit("end");
      }.bind(this)
    );
    this._deflate.end(filteredData);
  };
  return packerAsync.exports;
}
export {
  requirePackerAsync as __require
};
//# sourceMappingURL=index23.js.map
