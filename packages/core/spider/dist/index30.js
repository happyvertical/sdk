import require$$0 from "node:util";
import { __require as requirePool } from "./index16.js";
import { __require as requireMockUtils } from "./index78.js";
import { __require as requireMockSymbols } from "./index79.js";
import { __require as requireMockInterceptor } from "./index80.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireErrors } from "./index23.js";
var mockPool;
var hasRequiredMockPool;
function requireMockPool() {
  if (hasRequiredMockPool) return mockPool;
  hasRequiredMockPool = 1;
  const { promisify } = require$$0;
  const Pool = requirePool();
  const { buildMockDispatch } = requireMockUtils();
  const {
    kDispatches,
    kMockAgent,
    kClose,
    kOriginalClose,
    kOrigin,
    kOriginalDispatch,
    kConnected,
    kIgnoreTrailingSlash
  } = requireMockSymbols();
  const { MockInterceptor } = requireMockInterceptor();
  const Symbols = requireSymbols();
  const { InvalidArgumentError } = requireErrors();
  class MockPool extends Pool {
    constructor(origin, opts) {
      if (!opts || !opts.agent || typeof opts.agent.dispatch !== "function") {
        throw new InvalidArgumentError("Argument opts.agent must implement Agent");
      }
      super(origin, opts);
      this[kMockAgent] = opts.agent;
      this[kOrigin] = origin;
      this[kIgnoreTrailingSlash] = opts.ignoreTrailingSlash ?? false;
      this[kDispatches] = [];
      this[kConnected] = 1;
      this[kOriginalDispatch] = this.dispatch;
      this[kOriginalClose] = this.close.bind(this);
      this.dispatch = buildMockDispatch.call(this);
      this.close = this[kClose];
    }
    get [Symbols.kConnected]() {
      return this[kConnected];
    }
    /**
     * Sets up the base interceptor for mocking replies from undici.
     */
    intercept(opts) {
      return new MockInterceptor(
        opts && { ignoreTrailingSlash: this[kIgnoreTrailingSlash], ...opts },
        this[kDispatches]
      );
    }
    cleanMocks() {
      this[kDispatches] = [];
    }
    async [kClose]() {
      await promisify(this[kOriginalClose])();
      this[kConnected] = 0;
      this[kMockAgent][Symbols.kClients].delete(this[kOrigin]);
    }
  }
  mockPool = MockPool;
  return mockPool;
}
export {
  requireMockPool as __require
};
//# sourceMappingURL=index30.js.map
