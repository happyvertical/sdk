import { __exports as filterParseSync } from "./index103.js";
import { __require as requireSyncReader } from "./index73.js";
import { __require as requireFilterParse } from "./index64.js";
var hasRequiredFilterParseSync;
function requireFilterParseSync() {
  if (hasRequiredFilterParseSync) return filterParseSync;
  hasRequiredFilterParseSync = 1;
  let SyncReader = requireSyncReader();
  let Filter = requireFilterParse();
  filterParseSync.process = function(inBuffer, bitmapInfo) {
    let outBuffers = [];
    let reader = new SyncReader(inBuffer);
    let filter = new Filter(bitmapInfo, {
      read: reader.read.bind(reader),
      write: function(bufferPart) {
        outBuffers.push(bufferPart);
      },
      complete: function() {
      }
    });
    filter.start();
    reader.process();
    return Buffer.concat(outBuffers);
  };
  return filterParseSync;
}
export {
  requireFilterParseSync as __require
};
//# sourceMappingURL=index74.js.map
