import { __require as requireErrors } from "./index23.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireDispatcherBase } from "./index64.js";
import { __require as requirePool } from "./index16.js";
import { __require as requireClient } from "./index14.js";
import { __require as requireUtil } from "./index24.js";
var agent;
var hasRequiredAgent;
function requireAgent() {
  if (hasRequiredAgent) return agent;
  hasRequiredAgent = 1;
  const { InvalidArgumentError, MaxOriginsReachedError } = requireErrors();
  const { kClients, kRunning, kClose, kDestroy, kDispatch, kUrl } = requireSymbols();
  const DispatcherBase = requireDispatcherBase();
  const Pool = requirePool();
  const Client = requireClient();
  const util = requireUtil();
  const kOnConnect = Symbol("onConnect");
  const kOnDisconnect = Symbol("onDisconnect");
  const kOnConnectionError = Symbol("onConnectionError");
  const kOnDrain = Symbol("onDrain");
  const kFactory = Symbol("factory");
  const kOptions = Symbol("options");
  const kOrigins = Symbol("origins");
  function defaultFactory(origin, opts) {
    return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts);
  }
  class Agent extends DispatcherBase {
    constructor({ factory = defaultFactory, maxOrigins = Infinity, connect, ...options } = {}) {
      if (typeof factory !== "function") {
        throw new InvalidArgumentError("factory must be a function.");
      }
      if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
        throw new InvalidArgumentError("connect must be a function or an object");
      }
      if (typeof maxOrigins !== "number" || Number.isNaN(maxOrigins) || maxOrigins <= 0) {
        throw new InvalidArgumentError("maxOrigins must be a number greater than 0");
      }
      super();
      if (connect && typeof connect !== "function") {
        connect = { ...connect };
      }
      this[kOptions] = { ...util.deepClone(options), maxOrigins, connect };
      this[kFactory] = factory;
      this[kClients] = /* @__PURE__ */ new Map();
      this[kOrigins] = /* @__PURE__ */ new Set();
      this[kOnDrain] = (origin, targets) => {
        this.emit("drain", origin, [this, ...targets]);
      };
      this[kOnConnect] = (origin, targets) => {
        this.emit("connect", origin, [this, ...targets]);
      };
      this[kOnDisconnect] = (origin, targets, err) => {
        this.emit("disconnect", origin, [this, ...targets], err);
      };
      this[kOnConnectionError] = (origin, targets, err) => {
        this.emit("connectionError", origin, [this, ...targets], err);
      };
    }
    get [kRunning]() {
      let ret = 0;
      for (const { dispatcher } of this[kClients].values()) {
        ret += dispatcher[kRunning];
      }
      return ret;
    }
    [kDispatch](opts, handler) {
      let key;
      if (opts.origin && (typeof opts.origin === "string" || opts.origin instanceof URL)) {
        key = String(opts.origin);
      } else {
        throw new InvalidArgumentError("opts.origin must be a non-empty string or URL.");
      }
      if (this[kOrigins].size >= this[kOptions].maxOrigins && !this[kOrigins].has(key)) {
        throw new MaxOriginsReachedError();
      }
      const result = this[kClients].get(key);
      let dispatcher = result && result.dispatcher;
      if (!dispatcher) {
        const closeClientIfUnused = (connected) => {
          const result2 = this[kClients].get(key);
          if (result2) {
            if (connected) result2.count -= 1;
            if (result2.count <= 0) {
              this[kClients].delete(key);
              result2.dispatcher.close();
            }
            this[kOrigins].delete(key);
          }
        };
        dispatcher = this[kFactory](opts.origin, this[kOptions]).on("drain", this[kOnDrain]).on("connect", (origin, targets) => {
          const result2 = this[kClients].get(key);
          if (result2) {
            result2.count += 1;
          }
          this[kOnConnect](origin, targets);
        }).on("disconnect", (origin, targets, err) => {
          closeClientIfUnused(true);
          this[kOnDisconnect](origin, targets, err);
        }).on("connectionError", (origin, targets, err) => {
          closeClientIfUnused(false);
          this[kOnConnectionError](origin, targets, err);
        });
        this[kClients].set(key, { count: 0, dispatcher });
        this[kOrigins].add(key);
      }
      return dispatcher.dispatch(opts, handler);
    }
    [kClose]() {
      const closePromises = [];
      for (const { dispatcher } of this[kClients].values()) {
        closePromises.push(dispatcher.close());
      }
      this[kClients].clear();
      return Promise.all(closePromises);
    }
    [kDestroy](err) {
      const destroyPromises = [];
      for (const { dispatcher } of this[kClients].values()) {
        destroyPromises.push(dispatcher.destroy(err));
      }
      this[kClients].clear();
      return Promise.all(destroyPromises);
    }
    get stats() {
      const allClientStats = {};
      for (const { dispatcher } of this[kClients].values()) {
        if (dispatcher.stats) {
          allClientStats[dispatcher[kUrl].origin] = dispatcher.stats;
        }
      }
      return allClientStats;
    }
  }
  agent = Agent;
  return agent;
}
export {
  requireAgent as __require
};
//# sourceMappingURL=index18.js.map
