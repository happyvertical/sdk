import require$$0 from "node:zlib";
import { __require as requireUtil } from "./index98.js";
var permessageDeflate;
var hasRequiredPermessageDeflate;
function requirePermessageDeflate() {
  if (hasRequiredPermessageDeflate) return permessageDeflate;
  hasRequiredPermessageDeflate = 1;
  const { createInflateRaw, Z_DEFAULT_WINDOWBITS } = require$$0;
  const { isValidClientWindowBits } = requireUtil();
  const tail = Buffer.from([0, 0, 255, 255]);
  const kBuffer = Symbol("kBuffer");
  const kLength = Symbol("kLength");
  class PerMessageDeflate {
    /** @type {import('node:zlib').InflateRaw} */
    #inflate;
    #options = {};
    constructor(extensions) {
      this.#options.serverNoContextTakeover = extensions.has("server_no_context_takeover");
      this.#options.serverMaxWindowBits = extensions.get("server_max_window_bits");
    }
    decompress(chunk, fin, callback) {
      if (!this.#inflate) {
        let windowBits = Z_DEFAULT_WINDOWBITS;
        if (this.#options.serverMaxWindowBits) {
          if (!isValidClientWindowBits(this.#options.serverMaxWindowBits)) {
            callback(new Error("Invalid server_max_window_bits"));
            return;
          }
          windowBits = Number.parseInt(this.#options.serverMaxWindowBits);
        }
        this.#inflate = createInflateRaw({ windowBits });
        this.#inflate[kBuffer] = [];
        this.#inflate[kLength] = 0;
        this.#inflate.on("data", (data) => {
          this.#inflate[kBuffer].push(data);
          this.#inflate[kLength] += data.length;
        });
        this.#inflate.on("error", (err) => {
          this.#inflate = null;
          callback(err);
        });
      }
      this.#inflate.write(chunk);
      if (fin) {
        this.#inflate.write(tail);
      }
      this.#inflate.flush(() => {
        const full = Buffer.concat(this.#inflate[kBuffer], this.#inflate[kLength]);
        this.#inflate[kBuffer].length = 0;
        this.#inflate[kLength] = 0;
        callback(null, full);
      });
    }
  }
  permessageDeflate = { PerMessageDeflate };
  return permessageDeflate;
}
export {
  requirePermessageDeflate as __require
};
//# sourceMappingURL=index117.js.map
