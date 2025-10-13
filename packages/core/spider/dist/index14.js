import require$$0$1 from "node:assert";
import require$$0 from "node:net";
import require$$2 from "node:http";
import { __require as requireUtil } from "./index24.js";
import { __require as requireStats } from "./index61.js";
import { __require as requireDiagnostics } from "./index62.js";
import { __require as requireRequest } from "./index63.js";
import { __require as requireDispatcherBase } from "./index64.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireConnect } from "./index26.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireClientH1 } from "./index65.js";
import { __require as requireClientH2 } from "./index66.js";
var client;
var hasRequiredClient;
function requireClient() {
  if (hasRequiredClient) return client;
  hasRequiredClient = 1;
  const assert = require$$0$1;
  const net = require$$0;
  const http = require$$2;
  const util = requireUtil();
  const { ClientStats } = requireStats();
  const { channels } = requireDiagnostics();
  const Request = requireRequest();
  const DispatcherBase = requireDispatcherBase();
  const {
    InvalidArgumentError,
    InformationalError,
    ClientDestroyedError
  } = requireErrors();
  const buildConnector = requireConnect();
  const {
    kUrl,
    kServerName,
    kClient,
    kBusy,
    kConnect,
    kResuming,
    kRunning,
    kPending,
    kSize,
    kQueue,
    kConnected,
    kConnecting,
    kNeedDrain,
    kKeepAliveDefaultTimeout,
    kHostHeader,
    kPendingIdx,
    kRunningIdx,
    kError,
    kPipelining,
    kKeepAliveTimeoutValue,
    kMaxHeadersSize,
    kKeepAliveMaxTimeout,
    kKeepAliveTimeoutThreshold,
    kHeadersTimeout,
    kBodyTimeout,
    kStrictContentLength,
    kConnector,
    kMaxRequests,
    kCounter,
    kClose,
    kDestroy,
    kDispatch,
    kLocalAddress,
    kMaxResponseSize,
    kOnError,
    kHTTPContext,
    kMaxConcurrentStreams,
    kResume
  } = requireSymbols();
  const connectH1 = requireClientH1();
  const connectH2 = requireClientH2();
  const kClosedResolve = Symbol("kClosedResolve");
  const getDefaultNodeMaxHeaderSize = http && http.maxHeaderSize && Number.isInteger(http.maxHeaderSize) && http.maxHeaderSize > 0 ? () => http.maxHeaderSize : () => {
    throw new InvalidArgumentError("http module not available or http.maxHeaderSize invalid");
  };
  const noop = () => {
  };
  function getPipelining(client2) {
    return client2[kPipelining] ?? client2[kHTTPContext]?.defaultPipelining ?? 1;
  }
  class Client extends DispatcherBase {
    /**
     *
     * @param {string|URL} url
     * @param {import('../../types/client.js').Client.Options} options
     */
    constructor(url, {
      maxHeaderSize,
      headersTimeout,
      socketTimeout,
      requestTimeout,
      connectTimeout,
      bodyTimeout,
      idleTimeout,
      keepAlive,
      keepAliveTimeout,
      maxKeepAliveTimeout,
      keepAliveMaxTimeout,
      keepAliveTimeoutThreshold,
      socketPath,
      pipelining,
      tls,
      strictContentLength,
      maxCachedSessions,
      connect: connect2,
      maxRequestsPerClient,
      localAddress,
      maxResponseSize,
      autoSelectFamily,
      autoSelectFamilyAttemptTimeout,
      // h2
      maxConcurrentStreams,
      allowH2
    } = {}) {
      if (keepAlive !== void 0) {
        throw new InvalidArgumentError("unsupported keepAlive, use pipelining=0 instead");
      }
      if (socketTimeout !== void 0) {
        throw new InvalidArgumentError("unsupported socketTimeout, use headersTimeout & bodyTimeout instead");
      }
      if (requestTimeout !== void 0) {
        throw new InvalidArgumentError("unsupported requestTimeout, use headersTimeout & bodyTimeout instead");
      }
      if (idleTimeout !== void 0) {
        throw new InvalidArgumentError("unsupported idleTimeout, use keepAliveTimeout instead");
      }
      if (maxKeepAliveTimeout !== void 0) {
        throw new InvalidArgumentError("unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead");
      }
      if (maxHeaderSize != null) {
        if (!Number.isInteger(maxHeaderSize) || maxHeaderSize < 1) {
          throw new InvalidArgumentError("invalid maxHeaderSize");
        }
      } else {
        maxHeaderSize = getDefaultNodeMaxHeaderSize();
      }
      if (socketPath != null && typeof socketPath !== "string") {
        throw new InvalidArgumentError("invalid socketPath");
      }
      if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
        throw new InvalidArgumentError("invalid connectTimeout");
      }
      if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
        throw new InvalidArgumentError("invalid keepAliveTimeout");
      }
      if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
        throw new InvalidArgumentError("invalid keepAliveMaxTimeout");
      }
      if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
        throw new InvalidArgumentError("invalid keepAliveTimeoutThreshold");
      }
      if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
        throw new InvalidArgumentError("headersTimeout must be a positive integer or zero");
      }
      if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
        throw new InvalidArgumentError("bodyTimeout must be a positive integer or zero");
      }
      if (connect2 != null && typeof connect2 !== "function" && typeof connect2 !== "object") {
        throw new InvalidArgumentError("connect must be a function or an object");
      }
      if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) {
        throw new InvalidArgumentError("maxRequestsPerClient must be a positive number");
      }
      if (localAddress != null && (typeof localAddress !== "string" || net.isIP(localAddress) === 0)) {
        throw new InvalidArgumentError("localAddress must be valid string IP address");
      }
      if (maxResponseSize != null && (!Number.isInteger(maxResponseSize) || maxResponseSize < -1)) {
        throw new InvalidArgumentError("maxResponseSize must be a positive number");
      }
      if (autoSelectFamilyAttemptTimeout != null && (!Number.isInteger(autoSelectFamilyAttemptTimeout) || autoSelectFamilyAttemptTimeout < -1)) {
        throw new InvalidArgumentError("autoSelectFamilyAttemptTimeout must be a positive number");
      }
      if (allowH2 != null && typeof allowH2 !== "boolean") {
        throw new InvalidArgumentError("allowH2 must be a valid boolean value");
      }
      if (maxConcurrentStreams != null && (typeof maxConcurrentStreams !== "number" || maxConcurrentStreams < 1)) {
        throw new InvalidArgumentError("maxConcurrentStreams must be a positive integer, greater than 0");
      }
      super();
      if (typeof connect2 !== "function") {
        connect2 = buildConnector({
          ...tls,
          maxCachedSessions,
          allowH2,
          socketPath,
          timeout: connectTimeout,
          ...typeof autoSelectFamily === "boolean" ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : void 0,
          ...connect2
        });
      }
      this[kUrl] = util.parseOrigin(url);
      this[kConnector] = connect2;
      this[kPipelining] = pipelining != null ? pipelining : 1;
      this[kMaxHeadersSize] = maxHeaderSize;
      this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout;
      this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 6e5 : keepAliveMaxTimeout;
      this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 2e3 : keepAliveTimeoutThreshold;
      this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout];
      this[kServerName] = null;
      this[kLocalAddress] = localAddress != null ? localAddress : null;
      this[kResuming] = 0;
      this[kNeedDrain] = 0;
      this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ""}\r
`;
      this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 3e5;
      this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 3e5;
      this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength;
      this[kMaxRequests] = maxRequestsPerClient;
      this[kClosedResolve] = null;
      this[kMaxResponseSize] = maxResponseSize > -1 ? maxResponseSize : -1;
      this[kMaxConcurrentStreams] = maxConcurrentStreams != null ? maxConcurrentStreams : 100;
      this[kHTTPContext] = null;
      this[kQueue] = [];
      this[kRunningIdx] = 0;
      this[kPendingIdx] = 0;
      this[kResume] = (sync) => resume(this, sync);
      this[kOnError] = (err) => onError(this, err);
    }
    get pipelining() {
      return this[kPipelining];
    }
    set pipelining(value) {
      this[kPipelining] = value;
      this[kResume](true);
    }
    get stats() {
      return new ClientStats(this);
    }
    get [kPending]() {
      return this[kQueue].length - this[kPendingIdx];
    }
    get [kRunning]() {
      return this[kPendingIdx] - this[kRunningIdx];
    }
    get [kSize]() {
      return this[kQueue].length - this[kRunningIdx];
    }
    get [kConnected]() {
      return !!this[kHTTPContext] && !this[kConnecting] && !this[kHTTPContext].destroyed;
    }
    get [kBusy]() {
      return Boolean(
        this[kHTTPContext]?.busy(null) || this[kSize] >= (getPipelining(this) || 1) || this[kPending] > 0
      );
    }
    /* istanbul ignore: only used for test */
    [kConnect](cb) {
      connect(this);
      this.once("connect", cb);
    }
    [kDispatch](opts, handler) {
      const request = new Request(this[kUrl].origin, opts, handler);
      this[kQueue].push(request);
      if (this[kResuming]) ;
      else if (util.bodyLength(request.body) == null && util.isIterable(request.body)) {
        this[kResuming] = 1;
        queueMicrotask(() => resume(this));
      } else {
        this[kResume](true);
      }
      if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
        this[kNeedDrain] = 2;
      }
      return this[kNeedDrain] < 2;
    }
    [kClose]() {
      return new Promise((resolve) => {
        if (this[kSize]) {
          this[kClosedResolve] = resolve;
        } else {
          resolve(null);
        }
      });
    }
    [kDestroy](err) {
      return new Promise((resolve) => {
        const requests = this[kQueue].splice(this[kPendingIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          util.errorRequest(this, request, err);
        }
        const callback = () => {
          if (this[kClosedResolve]) {
            this[kClosedResolve]();
            this[kClosedResolve] = null;
          }
          resolve(null);
        };
        if (this[kHTTPContext]) {
          this[kHTTPContext].destroy(err, callback);
          this[kHTTPContext] = null;
        } else {
          queueMicrotask(callback);
        }
        this[kResume]();
      });
    }
  }
  function onError(client2, err) {
    if (client2[kRunning] === 0 && err.code !== "UND_ERR_INFO" && err.code !== "UND_ERR_SOCKET") {
      assert(client2[kPendingIdx] === client2[kRunningIdx]);
      const requests = client2[kQueue].splice(client2[kRunningIdx]);
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        util.errorRequest(client2, request, err);
      }
      assert(client2[kSize] === 0);
    }
  }
  function connect(client2) {
    assert(!client2[kConnecting]);
    assert(!client2[kHTTPContext]);
    let { host, hostname, protocol, port } = client2[kUrl];
    if (hostname[0] === "[") {
      const idx = hostname.indexOf("]");
      assert(idx !== -1);
      const ip = hostname.substring(1, idx);
      assert(net.isIPv6(ip));
      hostname = ip;
    }
    client2[kConnecting] = true;
    if (channels.beforeConnect.hasSubscribers) {
      channels.beforeConnect.publish({
        connectParams: {
          host,
          hostname,
          protocol,
          port,
          version: client2[kHTTPContext]?.version,
          servername: client2[kServerName],
          localAddress: client2[kLocalAddress]
        },
        connector: client2[kConnector]
      });
    }
    client2[kConnector]({
      host,
      hostname,
      protocol,
      port,
      servername: client2[kServerName],
      localAddress: client2[kLocalAddress]
    }, (err, socket) => {
      if (err) {
        handleConnectError(client2, err, { host, hostname, protocol, port });
        client2[kResume]();
        return;
      }
      if (client2.destroyed) {
        util.destroy(socket.on("error", noop), new ClientDestroyedError());
        client2[kResume]();
        return;
      }
      assert(socket);
      try {
        client2[kHTTPContext] = socket.alpnProtocol === "h2" ? connectH2(client2, socket) : connectH1(client2, socket);
      } catch (err2) {
        socket.destroy().on("error", noop);
        handleConnectError(client2, err2, { host, hostname, protocol, port });
        client2[kResume]();
        return;
      }
      client2[kConnecting] = false;
      socket[kCounter] = 0;
      socket[kMaxRequests] = client2[kMaxRequests];
      socket[kClient] = client2;
      socket[kError] = null;
      if (channels.connected.hasSubscribers) {
        channels.connected.publish({
          connectParams: {
            host,
            hostname,
            protocol,
            port,
            version: client2[kHTTPContext]?.version,
            servername: client2[kServerName],
            localAddress: client2[kLocalAddress]
          },
          connector: client2[kConnector],
          socket
        });
      }
      client2.emit("connect", client2[kUrl], [client2]);
      client2[kResume]();
    });
  }
  function handleConnectError(client2, err, { host, hostname, protocol, port }) {
    if (client2.destroyed) {
      return;
    }
    client2[kConnecting] = false;
    if (channels.connectError.hasSubscribers) {
      channels.connectError.publish({
        connectParams: {
          host,
          hostname,
          protocol,
          port,
          version: client2[kHTTPContext]?.version,
          servername: client2[kServerName],
          localAddress: client2[kLocalAddress]
        },
        connector: client2[kConnector],
        error: err
      });
    }
    if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
      assert(client2[kRunning] === 0);
      while (client2[kPending] > 0 && client2[kQueue][client2[kPendingIdx]].servername === client2[kServerName]) {
        const request = client2[kQueue][client2[kPendingIdx]++];
        util.errorRequest(client2, request, err);
      }
    } else {
      onError(client2, err);
    }
    client2.emit("connectionError", client2[kUrl], [client2], err);
  }
  function emitDrain(client2) {
    client2[kNeedDrain] = 0;
    client2.emit("drain", client2[kUrl], [client2]);
  }
  function resume(client2, sync) {
    if (client2[kResuming] === 2) {
      return;
    }
    client2[kResuming] = 2;
    _resume(client2, sync);
    client2[kResuming] = 0;
    if (client2[kRunningIdx] > 256) {
      client2[kQueue].splice(0, client2[kRunningIdx]);
      client2[kPendingIdx] -= client2[kRunningIdx];
      client2[kRunningIdx] = 0;
    }
  }
  function _resume(client2, sync) {
    while (true) {
      if (client2.destroyed) {
        assert(client2[kPending] === 0);
        return;
      }
      if (client2[kClosedResolve] && !client2[kSize]) {
        client2[kClosedResolve]();
        client2[kClosedResolve] = null;
        return;
      }
      if (client2[kHTTPContext]) {
        client2[kHTTPContext].resume();
      }
      if (client2[kBusy]) {
        client2[kNeedDrain] = 2;
      } else if (client2[kNeedDrain] === 2) {
        if (sync) {
          client2[kNeedDrain] = 1;
          queueMicrotask(() => emitDrain(client2));
        } else {
          emitDrain(client2);
        }
        continue;
      }
      if (client2[kPending] === 0) {
        return;
      }
      if (client2[kRunning] >= (getPipelining(client2) || 1)) {
        return;
      }
      const request = client2[kQueue][client2[kPendingIdx]];
      if (client2[kUrl].protocol === "https:" && client2[kServerName] !== request.servername) {
        if (client2[kRunning] > 0) {
          return;
        }
        client2[kServerName] = request.servername;
        client2[kHTTPContext]?.destroy(new InformationalError("servername changed"), () => {
          client2[kHTTPContext] = null;
          resume(client2);
        });
      }
      if (client2[kConnecting]) {
        return;
      }
      if (!client2[kHTTPContext]) {
        connect(client2);
        return;
      }
      if (client2[kHTTPContext].destroyed) {
        return;
      }
      if (client2[kHTTPContext].busy(request)) {
        return;
      }
      if (!request.aborted && client2[kHTTPContext].write(request)) {
        client2[kPendingIdx]++;
      } else {
        client2[kQueue].splice(client2[kPendingIdx], 1);
      }
    }
  }
  client = Client;
  return client;
}
export {
  requireClient as __require
};
//# sourceMappingURL=index14.js.map
