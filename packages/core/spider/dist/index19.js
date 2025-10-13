import { __require as requireSymbols } from "./index53.js";
import { __require as requireAgent } from "./index18.js";
import { __require as requirePool } from "./index16.js";
import { __require as requireDispatcherBase } from "./index64.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireConnect } from "./index26.js";
import { __require as requireClient } from "./index14.js";
var proxyAgent;
var hasRequiredProxyAgent;
function requireProxyAgent() {
  if (hasRequiredProxyAgent) return proxyAgent;
  hasRequiredProxyAgent = 1;
  const { kProxy, kClose, kDestroy, kDispatch } = requireSymbols();
  const Agent = requireAgent();
  const Pool = requirePool();
  const DispatcherBase = requireDispatcherBase();
  const { InvalidArgumentError, RequestAbortedError, SecureProxyConnectionError } = requireErrors();
  const buildConnector = requireConnect();
  const Client = requireClient();
  const kAgent = Symbol("proxy agent");
  const kClient = Symbol("proxy client");
  const kProxyHeaders = Symbol("proxy headers");
  const kRequestTls = Symbol("request tls settings");
  const kProxyTls = Symbol("proxy tls settings");
  const kConnectEndpoint = Symbol("connect endpoint function");
  const kTunnelProxy = Symbol("tunnel proxy");
  function defaultProtocolPort(protocol) {
    return protocol === "https:" ? 443 : 80;
  }
  function defaultFactory(origin, opts) {
    return new Pool(origin, opts);
  }
  const noop = () => {
  };
  function defaultAgentFactory(origin, opts) {
    if (opts.connections === 1) {
      return new Client(origin, opts);
    }
    return new Pool(origin, opts);
  }
  class Http1ProxyWrapper extends DispatcherBase {
    #client;
    constructor(proxyUrl, { headers = {}, connect, factory }) {
      if (!proxyUrl) {
        throw new InvalidArgumentError("Proxy URL is mandatory");
      }
      super();
      this[kProxyHeaders] = headers;
      if (factory) {
        this.#client = factory(proxyUrl, { connect });
      } else {
        this.#client = new Client(proxyUrl, { connect });
      }
    }
    [kDispatch](opts, handler) {
      const onHeaders = handler.onHeaders;
      handler.onHeaders = function(statusCode, data, resume) {
        if (statusCode === 407) {
          if (typeof handler.onError === "function") {
            handler.onError(new InvalidArgumentError("Proxy Authentication Required (407)"));
          }
          return;
        }
        if (onHeaders) onHeaders.call(this, statusCode, data, resume);
      };
      const {
        origin,
        path = "/",
        headers = {}
      } = opts;
      opts.path = origin + path;
      if (!("host" in headers) && !("Host" in headers)) {
        const { host } = new URL(origin);
        headers.host = host;
      }
      opts.headers = { ...this[kProxyHeaders], ...headers };
      return this.#client[kDispatch](opts, handler);
    }
    [kClose]() {
      return this.#client.close();
    }
    [kDestroy](err) {
      return this.#client.destroy(err);
    }
  }
  class ProxyAgent extends DispatcherBase {
    constructor(opts) {
      if (!opts || typeof opts === "object" && !(opts instanceof URL) && !opts.uri) {
        throw new InvalidArgumentError("Proxy uri is mandatory");
      }
      const { clientFactory = defaultFactory } = opts;
      if (typeof clientFactory !== "function") {
        throw new InvalidArgumentError("Proxy opts.clientFactory must be a function.");
      }
      const { proxyTunnel = true } = opts;
      super();
      const url = this.#getUrl(opts);
      const { href, origin, port, protocol, username, password, hostname: proxyHostname } = url;
      this[kProxy] = { uri: href, protocol };
      this[kRequestTls] = opts.requestTls;
      this[kProxyTls] = opts.proxyTls;
      this[kProxyHeaders] = opts.headers || {};
      this[kTunnelProxy] = proxyTunnel;
      if (opts.auth && opts.token) {
        throw new InvalidArgumentError("opts.auth cannot be used in combination with opts.token");
      } else if (opts.auth) {
        this[kProxyHeaders]["proxy-authorization"] = `Basic ${opts.auth}`;
      } else if (opts.token) {
        this[kProxyHeaders]["proxy-authorization"] = opts.token;
      } else if (username && password) {
        this[kProxyHeaders]["proxy-authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString("base64")}`;
      }
      const connect = buildConnector({ ...opts.proxyTls });
      this[kConnectEndpoint] = buildConnector({ ...opts.requestTls });
      const agentFactory = opts.factory || defaultAgentFactory;
      const factory = (origin2, options) => {
        const { protocol: protocol2 } = new URL(origin2);
        if (!this[kTunnelProxy] && protocol2 === "http:" && this[kProxy].protocol === "http:") {
          return new Http1ProxyWrapper(this[kProxy].uri, {
            headers: this[kProxyHeaders],
            connect,
            factory: agentFactory
          });
        }
        return agentFactory(origin2, options);
      };
      this[kClient] = clientFactory(url, { connect });
      this[kAgent] = new Agent({
        ...opts,
        factory,
        connect: async (opts2, callback) => {
          let requestedPath = opts2.host;
          if (!opts2.port) {
            requestedPath += `:${defaultProtocolPort(opts2.protocol)}`;
          }
          try {
            const { socket, statusCode } = await this[kClient].connect({
              origin,
              port,
              path: requestedPath,
              signal: opts2.signal,
              headers: {
                ...this[kProxyHeaders],
                host: opts2.host,
                ...opts2.connections == null || opts2.connections > 0 ? { "proxy-connection": "keep-alive" } : {}
              },
              servername: this[kProxyTls]?.servername || proxyHostname
            });
            if (statusCode !== 200) {
              socket.on("error", noop).destroy();
              callback(new RequestAbortedError(`Proxy response (${statusCode}) !== 200 when HTTP Tunneling`));
            }
            if (opts2.protocol !== "https:") {
              callback(null, socket);
              return;
            }
            let servername;
            if (this[kRequestTls]) {
              servername = this[kRequestTls].servername;
            } else {
              servername = opts2.servername;
            }
            this[kConnectEndpoint]({ ...opts2, servername, httpSocket: socket }, callback);
          } catch (err) {
            if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
              callback(new SecureProxyConnectionError(err));
            } else {
              callback(err);
            }
          }
        }
      });
    }
    dispatch(opts, handler) {
      const headers = buildHeaders(opts.headers);
      throwIfProxyAuthIsSent(headers);
      if (headers && !("host" in headers) && !("Host" in headers)) {
        const { host } = new URL(opts.origin);
        headers.host = host;
      }
      return this[kAgent].dispatch(
        {
          ...opts,
          headers
        },
        handler
      );
    }
    /**
     * @param {import('../../types/proxy-agent').ProxyAgent.Options | string | URL} opts
     * @returns {URL}
     */
    #getUrl(opts) {
      if (typeof opts === "string") {
        return new URL(opts);
      } else if (opts instanceof URL) {
        return opts;
      } else {
        return new URL(opts.uri);
      }
    }
    [kClose]() {
      return Promise.all([
        this[kAgent].close(),
        this[kClient].close()
      ]);
    }
    [kDestroy]() {
      return Promise.all([
        this[kAgent].destroy(),
        this[kClient].destroy()
      ]);
    }
  }
  function buildHeaders(headers) {
    if (Array.isArray(headers)) {
      const headersPair = {};
      for (let i = 0; i < headers.length; i += 2) {
        headersPair[headers[i]] = headers[i + 1];
      }
      return headersPair;
    }
    return headers;
  }
  function throwIfProxyAuthIsSent(headers) {
    const existProxyAuth = headers && Object.keys(headers).find((key) => key.toLowerCase() === "proxy-authorization");
    if (existProxyAuth) {
      throw new InvalidArgumentError("Proxy-Authorization should be sent in ProxyAgent constructor");
    }
  }
  proxyAgent = ProxyAgent;
  return proxyAgent;
}
export {
  requireProxyAgent as __require
};
//# sourceMappingURL=index19.js.map
