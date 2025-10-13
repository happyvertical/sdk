import require$$0 from "node:net";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireClient } from "./index14.js";
import { __require as requireDispatcherBase } from "./index64.js";
var h2cClient;
var hasRequiredH2cClient;
function requireH2cClient() {
  if (hasRequiredH2cClient) return h2cClient;
  hasRequiredH2cClient = 1;
  const { connect } = require$$0;
  const { kClose, kDestroy } = requireSymbols();
  const { InvalidArgumentError } = requireErrors();
  const util = requireUtil();
  const Client = requireClient();
  const DispatcherBase = requireDispatcherBase();
  class H2CClient extends DispatcherBase {
    #client = null;
    constructor(origin, clientOpts) {
      if (typeof origin === "string") {
        origin = new URL(origin);
      }
      if (origin.protocol !== "http:") {
        throw new InvalidArgumentError(
          "h2c-client: Only h2c protocol is supported"
        );
      }
      const { connect: connect2, maxConcurrentStreams, pipelining, ...opts } = clientOpts ?? {};
      let defaultMaxConcurrentStreams = 100;
      let defaultPipelining = 100;
      if (maxConcurrentStreams != null && Number.isInteger(maxConcurrentStreams) && maxConcurrentStreams > 0) {
        defaultMaxConcurrentStreams = maxConcurrentStreams;
      }
      if (pipelining != null && Number.isInteger(pipelining) && pipelining > 0) {
        defaultPipelining = pipelining;
      }
      if (defaultPipelining > defaultMaxConcurrentStreams) {
        throw new InvalidArgumentError(
          "h2c-client: pipelining cannot be greater than maxConcurrentStreams"
        );
      }
      super();
      this.#client = new Client(origin, {
        ...opts,
        connect: this.#buildConnector(connect2),
        maxConcurrentStreams: defaultMaxConcurrentStreams,
        pipelining: defaultPipelining,
        allowH2: true
      });
    }
    #buildConnector(connectOpts) {
      return (opts, callback) => {
        const timeout = connectOpts?.connectOpts ?? 1e4;
        const { hostname, port, pathname } = opts;
        const socket = connect({
          ...opts,
          host: hostname,
          port,
          pathname
        });
        if (opts.keepAlive == null || opts.keepAlive) {
          const keepAliveInitialDelay = opts.keepAliveInitialDelay == null ? 6e4 : opts.keepAliveInitialDelay;
          socket.setKeepAlive(true, keepAliveInitialDelay);
        }
        socket.alpnProtocol = "h2";
        const clearConnectTimeout = util.setupConnectTimeout(
          new WeakRef(socket),
          { timeout, hostname, port }
        );
        socket.setNoDelay(true).once("connect", function() {
          queueMicrotask(clearConnectTimeout);
          if (callback) {
            const cb = callback;
            callback = null;
            cb(null, this);
          }
        }).on("error", function(err) {
          queueMicrotask(clearConnectTimeout);
          if (callback) {
            const cb = callback;
            callback = null;
            cb(err);
          }
        });
        return socket;
      };
    }
    dispatch(opts, handler) {
      return this.#client.dispatch(opts, handler);
    }
    [kClose]() {
      return this.#client.close();
    }
    [kDestroy]() {
      return this.#client.destroy();
    }
  }
  h2cClient = H2CClient;
  return h2cClient;
}
export {
  requireH2cClient as __require
};
//# sourceMappingURL=index22.js.map
