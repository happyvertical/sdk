import { __module as filterParseAsync } from "./index50.js";
import require$$0 from "util";
import { __require as requireChunkstream } from "./index28.js";
import { __require as requireFilterParse } from "./index51.js";
var hasRequiredFilterParseAsync;
function requireFilterParseAsync() {
  if (hasRequiredFilterParseAsync) return filterParseAsync.exports;
  hasRequiredFilterParseAsync = 1;
  let util = require$$0;
  let ChunkStream = requireChunkstream();
  let Filter = requireFilterParse();
  let FilterAsync = filterParseAsync.exports = function(bitmapInfo) {
    ChunkStream.call(this);
    let buffers = [];
    let that = this;
    this._filter = new Filter(bitmapInfo, {
      read: this.read.bind(this),
      write: function(buffer) {
        buffers.push(buffer);
      },
      complete: function() {
        that.emit("complete", Buffer.concat(buffers));
      }
    });
    this._filter.start();
  };
  util.inherits(FilterAsync, ChunkStream);
  return filterParseAsync.exports;
}
export {
  requireFilterParseAsync as __require
};
//# sourceMappingURL=index29.js.map
