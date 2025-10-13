import { __module as undici } from "./index13.js";
import { __require as requireClient } from "./index14.js";
import { __require as requireDispatcher } from "./index15.js";
import { __require as requirePool } from "./index16.js";
import { __require as requireBalancedPool } from "./index17.js";
import { __require as requireAgent } from "./index18.js";
import { __require as requireProxyAgent } from "./index19.js";
import { __require as requireEnvHttpProxyAgent } from "./index20.js";
import { __require as requireRetryAgent } from "./index21.js";
import { __require as requireH2cClient } from "./index22.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireApi } from "./index25.js";
import { __require as requireConnect } from "./index26.js";
import { __require as requireMockClient } from "./index27.js";
import { __require as requireMockCallHistory } from "./index28.js";
import { __require as requireMockAgent } from "./index29.js";
import { __require as requireMockPool } from "./index30.js";
import { __require as requireSnapshotAgent } from "./index31.js";
import { __require as requireMockErrors } from "./index32.js";
import { __require as requireRetryHandler } from "./index33.js";
import { __require as requireGlobal } from "./index34.js";
import { __require as requireDecoratorHandler } from "./index35.js";
import { __require as requireRedirectHandler } from "./index36.js";
import { __require as requireRedirect } from "./index37.js";
import { __require as requireResponseError } from "./index38.js";
import { __require as requireRetry } from "./index39.js";
import { __require as requireDump } from "./index40.js";
import { __require as requireDns } from "./index41.js";
import { __require as requireCache } from "./index42.js";
import { __require as requireDecompress } from "./index43.js";
import { __require as requireMemoryCacheStore } from "./index44.js";
import { __require as requireSqliteCacheStore } from "./index45.js";
import { __require as requireFetch } from "./index46.js";
import { __require as requireHeaders } from "./index47.js";
import { __require as requireResponse } from "./index48.js";
import { __require as requireRequest } from "./index49.js";
import { __require as requireFormdata } from "./index50.js";
import { __require as requireGlobal$1 } from "./index51.js";
import { __require as requireCachestorage } from "./index52.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireCookies } from "./index54.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireEvents } from "./index56.js";
import { __require as requireWebsocket } from "./index57.js";
import { __require as requireWebsocketstream } from "./index58.js";
import { __require as requireWebsocketerror } from "./index59.js";
import { __require as requireEventsource } from "./index60.js";
undici.exports;
var hasRequiredUndici;
function requireUndici() {
  if (hasRequiredUndici) return undici.exports;
  hasRequiredUndici = 1;
  (function(module) {
    const Client = requireClient();
    const Dispatcher = requireDispatcher();
    const Pool = requirePool();
    const BalancedPool = requireBalancedPool();
    const Agent = requireAgent();
    const ProxyAgent = requireProxyAgent();
    const EnvHttpProxyAgent = requireEnvHttpProxyAgent();
    const RetryAgent = requireRetryAgent();
    const H2CClient = requireH2cClient();
    const errors = requireErrors();
    const util = requireUtil();
    const { InvalidArgumentError } = errors;
    const api = requireApi();
    const buildConnector = requireConnect();
    const MockClient = requireMockClient();
    const { MockCallHistory, MockCallHistoryLog } = requireMockCallHistory();
    const MockAgent = requireMockAgent();
    const MockPool = requireMockPool();
    const SnapshotAgent = requireSnapshotAgent();
    const mockErrors = requireMockErrors();
    const RetryHandler = requireRetryHandler();
    const { getGlobalDispatcher, setGlobalDispatcher } = requireGlobal();
    const DecoratorHandler = requireDecoratorHandler();
    const RedirectHandler = requireRedirectHandler();
    Object.assign(Dispatcher.prototype, api);
    module.exports.Dispatcher = Dispatcher;
    module.exports.Client = Client;
    module.exports.Pool = Pool;
    module.exports.BalancedPool = BalancedPool;
    module.exports.Agent = Agent;
    module.exports.ProxyAgent = ProxyAgent;
    module.exports.EnvHttpProxyAgent = EnvHttpProxyAgent;
    module.exports.RetryAgent = RetryAgent;
    module.exports.H2CClient = H2CClient;
    module.exports.RetryHandler = RetryHandler;
    module.exports.DecoratorHandler = DecoratorHandler;
    module.exports.RedirectHandler = RedirectHandler;
    module.exports.interceptors = {
      redirect: requireRedirect(),
      responseError: requireResponseError(),
      retry: requireRetry(),
      dump: requireDump(),
      dns: requireDns(),
      cache: requireCache(),
      decompress: requireDecompress()
    };
    module.exports.cacheStores = {
      MemoryCacheStore: requireMemoryCacheStore()
    };
    const SqliteCacheStore = requireSqliteCacheStore();
    module.exports.cacheStores.SqliteCacheStore = SqliteCacheStore;
    module.exports.buildConnector = buildConnector;
    module.exports.errors = errors;
    module.exports.util = {
      parseHeaders: util.parseHeaders,
      headerNameToString: util.headerNameToString
    };
    function makeDispatcher(fn) {
      return (url, opts, handler) => {
        if (typeof opts === "function") {
          handler = opts;
          opts = null;
        }
        if (!url || typeof url !== "string" && typeof url !== "object" && !(url instanceof URL)) {
          throw new InvalidArgumentError("invalid url");
        }
        if (opts != null && typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        if (opts && opts.path != null) {
          if (typeof opts.path !== "string") {
            throw new InvalidArgumentError("invalid opts.path");
          }
          let path = opts.path;
          if (!opts.path.startsWith("/")) {
            path = `/${path}`;
          }
          url = new URL(util.parseOrigin(url).origin + path);
        } else {
          if (!opts) {
            opts = typeof url === "object" ? url : {};
          }
          url = util.parseURL(url);
        }
        const { agent, dispatcher = getGlobalDispatcher() } = opts;
        if (agent) {
          throw new InvalidArgumentError("unsupported opts.agent. Did you mean opts.client?");
        }
        return fn.call(dispatcher, {
          ...opts,
          origin: url.origin,
          path: url.search ? `${url.pathname}${url.search}` : url.pathname,
          method: opts.method || (opts.body ? "PUT" : "GET")
        }, handler);
      };
    }
    module.exports.setGlobalDispatcher = setGlobalDispatcher;
    module.exports.getGlobalDispatcher = getGlobalDispatcher;
    const fetchImpl = requireFetch().fetch;
    module.exports.fetch = function fetch(init, options = void 0) {
      return fetchImpl(init, options).catch((err) => {
        if (err && typeof err === "object") {
          Error.captureStackTrace(err);
        }
        throw err;
      });
    };
    module.exports.Headers = requireHeaders().Headers;
    module.exports.Response = requireResponse().Response;
    module.exports.Request = requireRequest().Request;
    module.exports.FormData = requireFormdata().FormData;
    const { setGlobalOrigin, getGlobalOrigin } = requireGlobal$1();
    module.exports.setGlobalOrigin = setGlobalOrigin;
    module.exports.getGlobalOrigin = getGlobalOrigin;
    const { CacheStorage } = requireCachestorage();
    const { kConstruct } = requireSymbols();
    module.exports.caches = new CacheStorage(kConstruct);
    const { deleteCookie, getCookies, getSetCookies, setCookie, parseCookie } = requireCookies();
    module.exports.deleteCookie = deleteCookie;
    module.exports.getCookies = getCookies;
    module.exports.getSetCookies = getSetCookies;
    module.exports.setCookie = setCookie;
    module.exports.parseCookie = parseCookie;
    const { parseMIMEType, serializeAMimeType } = requireDataUrl();
    module.exports.parseMIMEType = parseMIMEType;
    module.exports.serializeAMimeType = serializeAMimeType;
    const { CloseEvent, ErrorEvent, MessageEvent } = requireEvents();
    const { WebSocket, ping } = requireWebsocket();
    module.exports.WebSocket = WebSocket;
    module.exports.CloseEvent = CloseEvent;
    module.exports.ErrorEvent = ErrorEvent;
    module.exports.MessageEvent = MessageEvent;
    module.exports.ping = ping;
    module.exports.WebSocketStream = requireWebsocketstream().WebSocketStream;
    module.exports.WebSocketError = requireWebsocketerror().WebSocketError;
    module.exports.request = makeDispatcher(api.request);
    module.exports.stream = makeDispatcher(api.stream);
    module.exports.pipeline = makeDispatcher(api.pipeline);
    module.exports.connect = makeDispatcher(api.connect);
    module.exports.upgrade = makeDispatcher(api.upgrade);
    module.exports.MockClient = MockClient;
    module.exports.MockCallHistory = MockCallHistory;
    module.exports.MockCallHistoryLog = MockCallHistoryLog;
    module.exports.MockPool = MockPool;
    module.exports.MockAgent = MockAgent;
    module.exports.SnapshotAgent = SnapshotAgent;
    module.exports.mockErrors = mockErrors;
    const { EventSource } = requireEventsource();
    module.exports.EventSource = EventSource;
    function install() {
      globalThis.fetch = module.exports.fetch;
      globalThis.Headers = module.exports.Headers;
      globalThis.Response = module.exports.Response;
      globalThis.Request = module.exports.Request;
      globalThis.FormData = module.exports.FormData;
      globalThis.WebSocket = module.exports.WebSocket;
      globalThis.CloseEvent = module.exports.CloseEvent;
      globalThis.ErrorEvent = module.exports.ErrorEvent;
      globalThis.MessageEvent = module.exports.MessageEvent;
      globalThis.EventSource = module.exports.EventSource;
    }
    module.exports.install = install;
  })(undici);
  return undici.exports;
}
export {
  requireUndici as __require
};
//# sourceMappingURL=index12.js.map
