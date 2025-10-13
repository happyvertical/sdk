import { __require as requireDispatcherBase } from "./index64.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireProxyAgent } from "./index19.js";
import { __require as requireAgent } from "./index18.js";
var envHttpProxyAgent;
var hasRequiredEnvHttpProxyAgent;
function requireEnvHttpProxyAgent() {
  if (hasRequiredEnvHttpProxyAgent) return envHttpProxyAgent;
  hasRequiredEnvHttpProxyAgent = 1;
  const DispatcherBase = requireDispatcherBase();
  const { kClose, kDestroy, kClosed, kDestroyed, kDispatch, kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent } = requireSymbols();
  const ProxyAgent = requireProxyAgent();
  const Agent = requireAgent();
  const DEFAULT_PORTS = {
    "http:": 80,
    "https:": 443
  };
  class EnvHttpProxyAgent extends DispatcherBase {
    #noProxyValue = null;
    #noProxyEntries = null;
    #opts = null;
    constructor(opts = {}) {
      super();
      this.#opts = opts;
      const { httpProxy, httpsProxy, noProxy, ...agentOpts } = opts;
      this[kNoProxyAgent] = new Agent(agentOpts);
      const HTTP_PROXY = httpProxy ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
      if (HTTP_PROXY) {
        this[kHttpProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTP_PROXY });
      } else {
        this[kHttpProxyAgent] = this[kNoProxyAgent];
      }
      const HTTPS_PROXY = httpsProxy ?? process.env.https_proxy ?? process.env.HTTPS_PROXY;
      if (HTTPS_PROXY) {
        this[kHttpsProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTPS_PROXY });
      } else {
        this[kHttpsProxyAgent] = this[kHttpProxyAgent];
      }
      this.#parseNoProxy();
    }
    [kDispatch](opts, handler) {
      const url = new URL(opts.origin);
      const agent = this.#getProxyAgentForUrl(url);
      return agent.dispatch(opts, handler);
    }
    [kClose]() {
      return Promise.all([
        this[kNoProxyAgent].close(),
        !this[kHttpProxyAgent][kClosed] && this[kHttpProxyAgent].close(),
        !this[kHttpsProxyAgent][kClosed] && this[kHttpsProxyAgent].close()
      ]);
    }
    [kDestroy](err) {
      return Promise.all([
        this[kNoProxyAgent].destroy(err),
        !this[kHttpProxyAgent][kDestroyed] && this[kHttpProxyAgent].destroy(err),
        !this[kHttpsProxyAgent][kDestroyed] && this[kHttpsProxyAgent].destroy(err)
      ]);
    }
    #getProxyAgentForUrl(url) {
      let { protocol, host: hostname, port } = url;
      hostname = hostname.replace(/:\d*$/, "").toLowerCase();
      port = Number.parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0;
      if (!this.#shouldProxy(hostname, port)) {
        return this[kNoProxyAgent];
      }
      if (protocol === "https:") {
        return this[kHttpsProxyAgent];
      }
      return this[kHttpProxyAgent];
    }
    #shouldProxy(hostname, port) {
      if (this.#noProxyChanged) {
        this.#parseNoProxy();
      }
      if (this.#noProxyEntries.length === 0) {
        return true;
      }
      if (this.#noProxyValue === "*") {
        return false;
      }
      for (let i = 0; i < this.#noProxyEntries.length; i++) {
        const entry = this.#noProxyEntries[i];
        if (entry.port && entry.port !== port) {
          continue;
        }
        if (!/^[.*]/.test(entry.hostname)) {
          if (hostname === entry.hostname) {
            return false;
          }
        } else {
          if (hostname.endsWith(entry.hostname.replace(/^\*/, ""))) {
            return false;
          }
        }
      }
      return true;
    }
    #parseNoProxy() {
      const noProxyValue = this.#opts.noProxy ?? this.#noProxyEnv;
      const noProxySplit = noProxyValue.split(/[,\s]/);
      const noProxyEntries = [];
      for (let i = 0; i < noProxySplit.length; i++) {
        const entry = noProxySplit[i];
        if (!entry) {
          continue;
        }
        const parsed = entry.match(/^(.+):(\d+)$/);
        noProxyEntries.push({
          hostname: (parsed ? parsed[1] : entry).toLowerCase(),
          port: parsed ? Number.parseInt(parsed[2], 10) : 0
        });
      }
      this.#noProxyValue = noProxyValue;
      this.#noProxyEntries = noProxyEntries;
    }
    get #noProxyChanged() {
      if (this.#opts.noProxy !== void 0) {
        return false;
      }
      return this.#noProxyValue !== this.#noProxyEnv;
    }
    get #noProxyEnv() {
      return process.env.no_proxy ?? process.env.NO_PROXY ?? "";
    }
  }
  envHttpProxyAgent = EnvHttpProxyAgent;
  return envHttpProxyAgent;
}
export {
  requireEnvHttpProxyAgent as __require
};
//# sourceMappingURL=index20.js.map
