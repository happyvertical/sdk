import { __require as requirePoolBase } from "./index68.js";
import { __require as requireClient } from "./index14.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireConnect } from "./index26.js";
var pool;
var hasRequiredPool;
function requirePool() {
  if (hasRequiredPool) return pool;
  hasRequiredPool = 1;
  const {
    PoolBase,
    kClients,
    kNeedDrain,
    kAddClient,
    kGetDispatcher,
    kRemoveClient
  } = requirePoolBase();
  const Client = requireClient();
  const {
    InvalidArgumentError
  } = requireErrors();
  const util = requireUtil();
  const { kUrl } = requireSymbols();
  const buildConnector = requireConnect();
  const kOptions = Symbol("options");
  const kConnections = Symbol("connections");
  const kFactory = Symbol("factory");
  function defaultFactory(origin, opts) {
    return new Client(origin, opts);
  }
  class Pool extends PoolBase {
    constructor(origin, {
      connections,
      factory = defaultFactory,
      connect,
      connectTimeout,
      tls,
      maxCachedSessions,
      socketPath,
      autoSelectFamily,
      autoSelectFamilyAttemptTimeout,
      allowH2,
      clientTtl,
      ...options
    } = {}) {
      if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
        throw new InvalidArgumentError("invalid connections");
      }
      if (typeof factory !== "function") {
        throw new InvalidArgumentError("factory must be a function.");
      }
      if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
        throw new InvalidArgumentError("connect must be a function or an object");
      }
      if (typeof connect !== "function") {
        connect = buildConnector({
          ...tls,
          maxCachedSessions,
          allowH2,
          socketPath,
          timeout: connectTimeout,
          ...typeof autoSelectFamily === "boolean" ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : void 0,
          ...connect
        });
      }
      super();
      this[kConnections] = connections || null;
      this[kUrl] = util.parseOrigin(origin);
      this[kOptions] = { ...util.deepClone(options), connect, allowH2, clientTtl };
      this[kOptions].interceptors = options.interceptors ? { ...options.interceptors } : void 0;
      this[kFactory] = factory;
      this.on("connect", (origin2, targets) => {
        if (clientTtl != null && clientTtl > 0) {
          for (const target of targets) {
            Object.assign(target, { ttl: Date.now() });
          }
        }
      });
      this.on("connectionError", (origin2, targets, error) => {
        for (const target of targets) {
          const idx = this[kClients].indexOf(target);
          if (idx !== -1) {
            this[kClients].splice(idx, 1);
          }
        }
      });
    }
    [kGetDispatcher]() {
      const clientTtlOption = this[kOptions].clientTtl;
      for (const client of this[kClients]) {
        if (clientTtlOption != null && clientTtlOption > 0 && client.ttl && Date.now() - client.ttl > clientTtlOption) {
          this[kRemoveClient](client);
        } else if (!client[kNeedDrain]) {
          return client;
        }
      }
      if (!this[kConnections] || this[kClients].length < this[kConnections]) {
        const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
        this[kAddClient](dispatcher);
        return dispatcher;
      }
    }
  }
  pool = Pool;
  return pool;
}
export {
  requirePool as __require
};
//# sourceMappingURL=index16.js.map
