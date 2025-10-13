import require$$0$1 from "node:net";
import require$$0 from "node:assert";
import { __require as requireUtil } from "./index24.js";
import { __require as requireErrors } from "./index23.js";
import require$$4 from "node:tls";
var connect;
var hasRequiredConnect;
function requireConnect() {
  if (hasRequiredConnect) return connect;
  hasRequiredConnect = 1;
  const net = require$$0$1;
  const assert = require$$0;
  const util = requireUtil();
  const { InvalidArgumentError } = requireErrors();
  let tls;
  const SessionCache = class WeakSessionCache {
    constructor(maxCachedSessions) {
      this._maxCachedSessions = maxCachedSessions;
      this._sessionCache = /* @__PURE__ */ new Map();
      this._sessionRegistry = new FinalizationRegistry((key) => {
        if (this._sessionCache.size < this._maxCachedSessions) {
          return;
        }
        const ref = this._sessionCache.get(key);
        if (ref !== void 0 && ref.deref() === void 0) {
          this._sessionCache.delete(key);
        }
      });
    }
    get(sessionKey) {
      const ref = this._sessionCache.get(sessionKey);
      return ref ? ref.deref() : null;
    }
    set(sessionKey, session) {
      if (this._maxCachedSessions === 0) {
        return;
      }
      this._sessionCache.set(sessionKey, new WeakRef(session));
      this._sessionRegistry.register(session, sessionKey);
    }
  };
  function buildConnector({ allowH2, maxCachedSessions, socketPath, timeout, session: customSession, ...opts }) {
    if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
      throw new InvalidArgumentError("maxCachedSessions must be a positive integer or zero");
    }
    const options = { path: socketPath, ...opts };
    const sessionCache = new SessionCache(maxCachedSessions == null ? 100 : maxCachedSessions);
    timeout = timeout == null ? 1e4 : timeout;
    allowH2 = allowH2 != null ? allowH2 : false;
    return function connect2({ hostname, host, protocol, port, servername, localAddress, httpSocket }, callback) {
      let socket;
      if (protocol === "https:") {
        if (!tls) {
          tls = require$$4;
        }
        servername = servername || options.servername || util.getServerName(host) || null;
        const sessionKey = servername || hostname;
        assert(sessionKey);
        const session = customSession || sessionCache.get(sessionKey) || null;
        port = port || 443;
        socket = tls.connect({
          highWaterMark: 16384,
          // TLS in node can't have bigger HWM anyway...
          ...options,
          servername,
          session,
          localAddress,
          ALPNProtocols: allowH2 ? ["http/1.1", "h2"] : ["http/1.1"],
          socket: httpSocket,
          // upgrade socket connection
          port,
          host: hostname
        });
        socket.on("session", function(session2) {
          sessionCache.set(sessionKey, session2);
        });
      } else {
        assert(!httpSocket, "httpSocket can only be sent on TLS update");
        port = port || 80;
        socket = net.connect({
          highWaterMark: 64 * 1024,
          // Same as nodejs fs streams.
          ...options,
          localAddress,
          port,
          host: hostname
        });
      }
      if (options.keepAlive == null || options.keepAlive) {
        const keepAliveInitialDelay = options.keepAliveInitialDelay === void 0 ? 6e4 : options.keepAliveInitialDelay;
        socket.setKeepAlive(true, keepAliveInitialDelay);
      }
      const clearConnectTimeout = util.setupConnectTimeout(new WeakRef(socket), { timeout, hostname, port });
      socket.setNoDelay(true).once(protocol === "https:" ? "secureConnect" : "connect", function() {
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
  connect = buildConnector;
  return connect;
}
export {
  requireConnect as __require
};
//# sourceMappingURL=index26.js.map
