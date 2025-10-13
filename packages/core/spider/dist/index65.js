import require$$0 from "node:assert";
import { __require as requireUtil } from "./index24.js";
import { __require as requireDiagnostics } from "./index62.js";
import { __require as requireTimers } from "./index69.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireConstants } from "./index105.js";
import { __require as requireLlhttpWasm } from "./index106.js";
import { __require as requireLlhttp_simdWasm } from "./index107.js";
import { __require as requireBody } from "./index89.js";
var clientH1;
var hasRequiredClientH1;
function requireClientH1() {
  if (hasRequiredClientH1) return clientH1;
  hasRequiredClientH1 = 1;
  const assert = require$$0;
  const util = requireUtil();
  const { channels } = requireDiagnostics();
  const timers = requireTimers();
  const {
    RequestContentLengthMismatchError,
    ResponseContentLengthMismatchError,
    RequestAbortedError,
    HeadersTimeoutError,
    HeadersOverflowError,
    SocketError,
    InformationalError,
    BodyTimeoutError,
    HTTPParserError,
    ResponseExceededMaxSizeError
  } = requireErrors();
  const {
    kUrl,
    kReset,
    kClient,
    kParser,
    kBlocking,
    kRunning,
    kPending,
    kSize,
    kWriting,
    kQueue,
    kNoRef,
    kKeepAliveDefaultTimeout,
    kHostHeader,
    kPendingIdx,
    kRunningIdx,
    kError,
    kPipelining,
    kSocket,
    kKeepAliveTimeoutValue,
    kMaxHeadersSize,
    kKeepAliveMaxTimeout,
    kKeepAliveTimeoutThreshold,
    kHeadersTimeout,
    kBodyTimeout,
    kStrictContentLength,
    kMaxRequests,
    kCounter,
    kMaxResponseSize,
    kOnError,
    kResume,
    kHTTPContext,
    kClosed
  } = requireSymbols();
  const constants = requireConstants();
  const EMPTY_BUF = Buffer.alloc(0);
  const FastBuffer = Buffer[Symbol.species];
  const removeAllListeners = util.removeAllListeners;
  let extractBody;
  function lazyllhttp() {
    const llhttpWasmData = process.env.JEST_WORKER_ID ? requireLlhttpWasm() : void 0;
    let mod;
    let useWasmSIMD = process.arch !== "ppc64";
    if (process.env.UNDICI_NO_WASM_SIMD === "1") {
      useWasmSIMD = true;
    } else if (process.env.UNDICI_NO_WASM_SIMD === "0") {
      useWasmSIMD = false;
    }
    if (useWasmSIMD) {
      try {
        mod = new WebAssembly.Module(requireLlhttp_simdWasm());
      } catch {
      }
    }
    if (!mod) {
      mod = new WebAssembly.Module(llhttpWasmData || requireLlhttpWasm());
    }
    return new WebAssembly.Instance(mod, {
      env: {
        /**
         * @param {number} p
         * @param {number} at
         * @param {number} len
         * @returns {number}
         */
        wasm_on_url: (p, at, len) => {
          return 0;
        },
        /**
         * @param {number} p
         * @param {number} at
         * @param {number} len
         * @returns {number}
         */
        wasm_on_status: (p, at, len) => {
          assert(currentParser.ptr === p);
          const start = at - currentBufferPtr + currentBufferRef.byteOffset;
          return currentParser.onStatus(new FastBuffer(currentBufferRef.buffer, start, len));
        },
        /**
         * @param {number} p
         * @returns {number}
         */
        wasm_on_message_begin: (p) => {
          assert(currentParser.ptr === p);
          return currentParser.onMessageBegin();
        },
        /**
         * @param {number} p
         * @param {number} at
         * @param {number} len
         * @returns {number}
         */
        wasm_on_header_field: (p, at, len) => {
          assert(currentParser.ptr === p);
          const start = at - currentBufferPtr + currentBufferRef.byteOffset;
          return currentParser.onHeaderField(new FastBuffer(currentBufferRef.buffer, start, len));
        },
        /**
         * @param {number} p
         * @param {number} at
         * @param {number} len
         * @returns {number}
         */
        wasm_on_header_value: (p, at, len) => {
          assert(currentParser.ptr === p);
          const start = at - currentBufferPtr + currentBufferRef.byteOffset;
          return currentParser.onHeaderValue(new FastBuffer(currentBufferRef.buffer, start, len));
        },
        /**
         * @param {number} p
         * @param {number} statusCode
         * @param {0|1} upgrade
         * @param {0|1} shouldKeepAlive
         * @returns {number}
         */
        wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
          assert(currentParser.ptr === p);
          return currentParser.onHeadersComplete(statusCode, upgrade === 1, shouldKeepAlive === 1);
        },
        /**
         * @param {number} p
         * @param {number} at
         * @param {number} len
         * @returns {number}
         */
        wasm_on_body: (p, at, len) => {
          assert(currentParser.ptr === p);
          const start = at - currentBufferPtr + currentBufferRef.byteOffset;
          return currentParser.onBody(new FastBuffer(currentBufferRef.buffer, start, len));
        },
        /**
         * @param {number} p
         * @returns {number}
         */
        wasm_on_message_complete: (p) => {
          assert(currentParser.ptr === p);
          return currentParser.onMessageComplete();
        }
      }
    });
  }
  let llhttpInstance = null;
  let currentParser = null;
  let currentBufferRef = null;
  let currentBufferSize = 0;
  let currentBufferPtr = null;
  const USE_NATIVE_TIMER = 0;
  const USE_FAST_TIMER = 1;
  const TIMEOUT_HEADERS = 2 | USE_FAST_TIMER;
  const TIMEOUT_BODY = 4 | USE_FAST_TIMER;
  const TIMEOUT_KEEP_ALIVE = 8 | USE_NATIVE_TIMER;
  class Parser {
    /**
       * @param {import('./client.js')} client
       * @param {import('net').Socket} socket
       * @param {*} llhttp
       */
    constructor(client, socket, { exports }) {
      this.llhttp = exports;
      this.ptr = this.llhttp.llhttp_alloc(constants.TYPE.RESPONSE);
      this.client = client;
      this.socket = socket;
      this.timeout = null;
      this.timeoutValue = null;
      this.timeoutType = null;
      this.statusCode = 0;
      this.statusText = "";
      this.upgrade = false;
      this.headers = [];
      this.headersSize = 0;
      this.headersMaxSize = client[kMaxHeadersSize];
      this.shouldKeepAlive = false;
      this.paused = false;
      this.resume = this.resume.bind(this);
      this.bytesRead = 0;
      this.keepAlive = "";
      this.contentLength = "";
      this.connection = "";
      this.maxResponseSize = client[kMaxResponseSize];
    }
    setTimeout(delay, type) {
      if (delay !== this.timeoutValue || type & USE_FAST_TIMER ^ this.timeoutType & USE_FAST_TIMER) {
        if (this.timeout) {
          timers.clearTimeout(this.timeout);
          this.timeout = null;
        }
        if (delay) {
          if (type & USE_FAST_TIMER) {
            this.timeout = timers.setFastTimeout(onParserTimeout, delay, new WeakRef(this));
          } else {
            this.timeout = setTimeout(onParserTimeout, delay, new WeakRef(this));
            this.timeout?.unref();
          }
        }
        this.timeoutValue = delay;
      } else if (this.timeout) {
        if (this.timeout.refresh) {
          this.timeout.refresh();
        }
      }
      this.timeoutType = type;
    }
    resume() {
      if (this.socket.destroyed || !this.paused) {
        return;
      }
      assert(this.ptr != null);
      assert(currentParser === null);
      this.llhttp.llhttp_resume(this.ptr);
      assert(this.timeoutType === TIMEOUT_BODY);
      if (this.timeout) {
        if (this.timeout.refresh) {
          this.timeout.refresh();
        }
      }
      this.paused = false;
      this.execute(this.socket.read() || EMPTY_BUF);
      this.readMore();
    }
    readMore() {
      while (!this.paused && this.ptr) {
        const chunk = this.socket.read();
        if (chunk === null) {
          break;
        }
        this.execute(chunk);
      }
    }
    /**
     * @param {Buffer} chunk
     */
    execute(chunk) {
      assert(currentParser === null);
      assert(this.ptr != null);
      assert(!this.paused);
      const { socket, llhttp } = this;
      if (chunk.length > currentBufferSize) {
        if (currentBufferPtr) {
          llhttp.free(currentBufferPtr);
        }
        currentBufferSize = Math.ceil(chunk.length / 4096) * 4096;
        currentBufferPtr = llhttp.malloc(currentBufferSize);
      }
      new Uint8Array(llhttp.memory.buffer, currentBufferPtr, currentBufferSize).set(chunk);
      try {
        let ret;
        try {
          currentBufferRef = chunk;
          currentParser = this;
          ret = llhttp.llhttp_execute(this.ptr, currentBufferPtr, chunk.length);
        } finally {
          currentParser = null;
          currentBufferRef = null;
        }
        if (ret !== constants.ERROR.OK) {
          const data = chunk.subarray(llhttp.llhttp_get_error_pos(this.ptr) - currentBufferPtr);
          if (ret === constants.ERROR.PAUSED_UPGRADE) {
            this.onUpgrade(data);
          } else if (ret === constants.ERROR.PAUSED) {
            this.paused = true;
            socket.unshift(data);
          } else {
            const ptr = llhttp.llhttp_get_error_reason(this.ptr);
            let message = "";
            if (ptr) {
              const len = new Uint8Array(llhttp.memory.buffer, ptr).indexOf(0);
              message = "Response does not match the HTTP/1.1 protocol (" + Buffer.from(llhttp.memory.buffer, ptr, len).toString() + ")";
            }
            throw new HTTPParserError(message, constants.ERROR[ret], data);
          }
        }
      } catch (err) {
        util.destroy(socket, err);
      }
    }
    destroy() {
      assert(currentParser === null);
      assert(this.ptr != null);
      this.llhttp.llhttp_free(this.ptr);
      this.ptr = null;
      this.timeout && timers.clearTimeout(this.timeout);
      this.timeout = null;
      this.timeoutValue = null;
      this.timeoutType = null;
      this.paused = false;
    }
    /**
     * @param {Buffer} buf
     * @returns {0}
     */
    onStatus(buf) {
      this.statusText = buf.toString();
      return 0;
    }
    /**
     * @returns {0|-1}
     */
    onMessageBegin() {
      const { socket, client } = this;
      if (socket.destroyed) {
        return -1;
      }
      const request = client[kQueue][client[kRunningIdx]];
      if (!request) {
        return -1;
      }
      request.onResponseStarted();
      return 0;
    }
    /**
     * @param {Buffer} buf
     * @returns {number}
     */
    onHeaderField(buf) {
      const len = this.headers.length;
      if ((len & 1) === 0) {
        this.headers.push(buf);
      } else {
        this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
      }
      this.trackHeader(buf.length);
      return 0;
    }
    /**
     * @param {Buffer} buf
     * @returns {number}
     */
    onHeaderValue(buf) {
      let len = this.headers.length;
      if ((len & 1) === 1) {
        this.headers.push(buf);
        len += 1;
      } else {
        this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
      }
      const key = this.headers[len - 2];
      if (key.length === 10) {
        const headerName = util.bufferToLowerCasedHeaderName(key);
        if (headerName === "keep-alive") {
          this.keepAlive += buf.toString();
        } else if (headerName === "connection") {
          this.connection += buf.toString();
        }
      } else if (key.length === 14 && util.bufferToLowerCasedHeaderName(key) === "content-length") {
        this.contentLength += buf.toString();
      }
      this.trackHeader(buf.length);
      return 0;
    }
    /**
     * @param {number} len
     */
    trackHeader(len) {
      this.headersSize += len;
      if (this.headersSize >= this.headersMaxSize) {
        util.destroy(this.socket, new HeadersOverflowError());
      }
    }
    /**
     * @param {Buffer} head
     */
    onUpgrade(head) {
      const { upgrade, client, socket, headers, statusCode } = this;
      assert(upgrade);
      assert(client[kSocket] === socket);
      assert(!socket.destroyed);
      assert(!this.paused);
      assert((headers.length & 1) === 0);
      const request = client[kQueue][client[kRunningIdx]];
      assert(request);
      assert(request.upgrade || request.method === "CONNECT");
      this.statusCode = 0;
      this.statusText = "";
      this.shouldKeepAlive = false;
      this.headers = [];
      this.headersSize = 0;
      socket.unshift(head);
      socket[kParser].destroy();
      socket[kParser] = null;
      socket[kClient] = null;
      socket[kError] = null;
      removeAllListeners(socket);
      client[kSocket] = null;
      client[kHTTPContext] = null;
      client[kQueue][client[kRunningIdx]++] = null;
      client.emit("disconnect", client[kUrl], [client], new InformationalError("upgrade"));
      try {
        request.onUpgrade(statusCode, headers, socket);
      } catch (err) {
        util.destroy(socket, err);
      }
      client[kResume]();
    }
    /**
     * @param {number} statusCode
     * @param {boolean} upgrade
     * @param {boolean} shouldKeepAlive
     * @returns {number}
     */
    onHeadersComplete(statusCode, upgrade, shouldKeepAlive) {
      const { client, socket, headers, statusText } = this;
      if (socket.destroyed) {
        return -1;
      }
      const request = client[kQueue][client[kRunningIdx]];
      if (!request) {
        return -1;
      }
      assert(!this.upgrade);
      assert(this.statusCode < 200);
      if (statusCode === 100) {
        util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
        return -1;
      }
      if (upgrade && !request.upgrade) {
        util.destroy(socket, new SocketError("bad upgrade", util.getSocketInfo(socket)));
        return -1;
      }
      assert(this.timeoutType === TIMEOUT_HEADERS);
      this.statusCode = statusCode;
      this.shouldKeepAlive = shouldKeepAlive || // Override llhttp value which does not allow keepAlive for HEAD.
      request.method === "HEAD" && !socket[kReset] && this.connection.toLowerCase() === "keep-alive";
      if (this.statusCode >= 200) {
        const bodyTimeout = request.bodyTimeout != null ? request.bodyTimeout : client[kBodyTimeout];
        this.setTimeout(bodyTimeout, TIMEOUT_BODY);
      } else if (this.timeout) {
        if (this.timeout.refresh) {
          this.timeout.refresh();
        }
      }
      if (request.method === "CONNECT") {
        assert(client[kRunning] === 1);
        this.upgrade = true;
        return 2;
      }
      if (upgrade) {
        assert(client[kRunning] === 1);
        this.upgrade = true;
        return 2;
      }
      assert((this.headers.length & 1) === 0);
      this.headers = [];
      this.headersSize = 0;
      if (this.shouldKeepAlive && client[kPipelining]) {
        const keepAliveTimeout = this.keepAlive ? util.parseKeepAliveTimeout(this.keepAlive) : null;
        if (keepAliveTimeout != null) {
          const timeout = Math.min(
            keepAliveTimeout - client[kKeepAliveTimeoutThreshold],
            client[kKeepAliveMaxTimeout]
          );
          if (timeout <= 0) {
            socket[kReset] = true;
          } else {
            client[kKeepAliveTimeoutValue] = timeout;
          }
        } else {
          client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout];
        }
      } else {
        socket[kReset] = true;
      }
      const pause = request.onHeaders(statusCode, headers, this.resume, statusText) === false;
      if (request.aborted) {
        return -1;
      }
      if (request.method === "HEAD") {
        return 1;
      }
      if (statusCode < 200) {
        return 1;
      }
      if (socket[kBlocking]) {
        socket[kBlocking] = false;
        client[kResume]();
      }
      return pause ? constants.ERROR.PAUSED : 0;
    }
    /**
     * @param {Buffer} buf
     * @returns {number}
     */
    onBody(buf) {
      const { client, socket, statusCode, maxResponseSize } = this;
      if (socket.destroyed) {
        return -1;
      }
      const request = client[kQueue][client[kRunningIdx]];
      assert(request);
      assert(this.timeoutType === TIMEOUT_BODY);
      if (this.timeout) {
        if (this.timeout.refresh) {
          this.timeout.refresh();
        }
      }
      assert(statusCode >= 200);
      if (maxResponseSize > -1 && this.bytesRead + buf.length > maxResponseSize) {
        util.destroy(socket, new ResponseExceededMaxSizeError());
        return -1;
      }
      this.bytesRead += buf.length;
      if (request.onData(buf) === false) {
        return constants.ERROR.PAUSED;
      }
      return 0;
    }
    /**
     * @returns {number}
     */
    onMessageComplete() {
      const { client, socket, statusCode, upgrade, headers, contentLength, bytesRead, shouldKeepAlive } = this;
      if (socket.destroyed && (!statusCode || shouldKeepAlive)) {
        return -1;
      }
      if (upgrade) {
        return 0;
      }
      assert(statusCode >= 100);
      assert((this.headers.length & 1) === 0);
      const request = client[kQueue][client[kRunningIdx]];
      assert(request);
      this.statusCode = 0;
      this.statusText = "";
      this.bytesRead = 0;
      this.contentLength = "";
      this.keepAlive = "";
      this.connection = "";
      this.headers = [];
      this.headersSize = 0;
      if (statusCode < 200) {
        return 0;
      }
      if (request.method !== "HEAD" && contentLength && bytesRead !== parseInt(contentLength, 10)) {
        util.destroy(socket, new ResponseContentLengthMismatchError());
        return -1;
      }
      request.onComplete(headers);
      client[kQueue][client[kRunningIdx]++] = null;
      if (socket[kWriting]) {
        assert(client[kRunning] === 0);
        util.destroy(socket, new InformationalError("reset"));
        return constants.ERROR.PAUSED;
      } else if (!shouldKeepAlive) {
        util.destroy(socket, new InformationalError("reset"));
        return constants.ERROR.PAUSED;
      } else if (socket[kReset] && client[kRunning] === 0) {
        util.destroy(socket, new InformationalError("reset"));
        return constants.ERROR.PAUSED;
      } else if (client[kPipelining] == null || client[kPipelining] === 1) {
        setImmediate(client[kResume]);
      } else {
        client[kResume]();
      }
      return 0;
    }
  }
  function onParserTimeout(parser) {
    const { socket, timeoutType, client, paused } = parser.deref();
    if (timeoutType === TIMEOUT_HEADERS) {
      if (!socket[kWriting] || socket.writableNeedDrain || client[kRunning] > 1) {
        assert(!paused, "cannot be paused while waiting for headers");
        util.destroy(socket, new HeadersTimeoutError());
      }
    } else if (timeoutType === TIMEOUT_BODY) {
      if (!paused) {
        util.destroy(socket, new BodyTimeoutError());
      }
    } else if (timeoutType === TIMEOUT_KEEP_ALIVE) {
      assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue]);
      util.destroy(socket, new InformationalError("socket idle timeout"));
    }
  }
  function connectH1(client, socket) {
    client[kSocket] = socket;
    if (!llhttpInstance) {
      llhttpInstance = lazyllhttp();
    }
    if (socket.errored) {
      throw socket.errored;
    }
    if (socket.destroyed) {
      throw new SocketError("destroyed");
    }
    socket[kNoRef] = false;
    socket[kWriting] = false;
    socket[kReset] = false;
    socket[kBlocking] = false;
    socket[kParser] = new Parser(client, socket, llhttpInstance);
    util.addListener(socket, "error", onHttpSocketError);
    util.addListener(socket, "readable", onHttpSocketReadable);
    util.addListener(socket, "end", onHttpSocketEnd);
    util.addListener(socket, "close", onHttpSocketClose);
    socket[kClosed] = false;
    socket.on("close", onSocketClose);
    return {
      version: "h1",
      defaultPipelining: 1,
      write(request) {
        return writeH1(client, request);
      },
      resume() {
        resumeH1(client);
      },
      /**
       * @param {Error|undefined} err
       * @param {() => void} callback
       */
      destroy(err, callback) {
        if (socket[kClosed]) {
          queueMicrotask(callback);
        } else {
          socket.on("close", callback);
          socket.destroy(err);
        }
      },
      /**
       * @returns {boolean}
       */
      get destroyed() {
        return socket.destroyed;
      },
      /**
       * @param {import('../core/request.js')} request
       * @returns {boolean}
       */
      busy(request) {
        if (socket[kWriting] || socket[kReset] || socket[kBlocking]) {
          return true;
        }
        if (request) {
          if (client[kRunning] > 0 && !request.idempotent) {
            return true;
          }
          if (client[kRunning] > 0 && (request.upgrade || request.method === "CONNECT")) {
            return true;
          }
          if (client[kRunning] > 0 && util.bodyLength(request.body) !== 0 && (util.isStream(request.body) || util.isAsyncIterable(request.body) || util.isFormDataLike(request.body))) {
            return true;
          }
        }
        return false;
      }
    };
  }
  function onHttpSocketError(err) {
    assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
    const parser = this[kParser];
    if (err.code === "ECONNRESET" && parser.statusCode && !parser.shouldKeepAlive) {
      parser.onMessageComplete();
      return;
    }
    this[kError] = err;
    this[kClient][kOnError](err);
  }
  function onHttpSocketReadable() {
    this[kParser]?.readMore();
  }
  function onHttpSocketEnd() {
    const parser = this[kParser];
    if (parser.statusCode && !parser.shouldKeepAlive) {
      parser.onMessageComplete();
      return;
    }
    util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
  }
  function onHttpSocketClose() {
    const parser = this[kParser];
    if (parser) {
      if (!this[kError] && parser.statusCode && !parser.shouldKeepAlive) {
        parser.onMessageComplete();
      }
      this[kParser].destroy();
      this[kParser] = null;
    }
    const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
    const client = this[kClient];
    client[kSocket] = null;
    client[kHTTPContext] = null;
    if (client.destroyed) {
      assert(client[kPending] === 0);
      const requests = client[kQueue].splice(client[kRunningIdx]);
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        util.errorRequest(client, request, err);
      }
    } else if (client[kRunning] > 0 && err.code !== "UND_ERR_INFO") {
      const request = client[kQueue][client[kRunningIdx]];
      client[kQueue][client[kRunningIdx]++] = null;
      util.errorRequest(client, request, err);
    }
    client[kPendingIdx] = client[kRunningIdx];
    assert(client[kRunning] === 0);
    client.emit("disconnect", client[kUrl], [client], err);
    client[kResume]();
  }
  function onSocketClose() {
    this[kClosed] = true;
  }
  function resumeH1(client) {
    const socket = client[kSocket];
    if (socket && !socket.destroyed) {
      if (client[kSize] === 0) {
        if (!socket[kNoRef] && socket.unref) {
          socket.unref();
          socket[kNoRef] = true;
        }
      } else if (socket[kNoRef] && socket.ref) {
        socket.ref();
        socket[kNoRef] = false;
      }
      if (client[kSize] === 0) {
        if (socket[kParser].timeoutType !== TIMEOUT_KEEP_ALIVE) {
          socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_KEEP_ALIVE);
        }
      } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
        if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
          const request = client[kQueue][client[kRunningIdx]];
          const headersTimeout = request.headersTimeout != null ? request.headersTimeout : client[kHeadersTimeout];
          socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS);
        }
      }
    }
  }
  function shouldSendContentLength(method) {
    return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
  }
  function writeH1(client, request) {
    const { method, path, host, upgrade, blocking, reset } = request;
    let { body, headers, contentLength } = request;
    const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH" || method === "QUERY" || method === "PROPFIND" || method === "PROPPATCH";
    if (util.isFormDataLike(body)) {
      if (!extractBody) {
        extractBody = requireBody().extractBody;
      }
      const [bodyStream, contentType] = extractBody(body);
      if (request.contentType == null) {
        headers.push("content-type", contentType);
      }
      body = bodyStream.stream;
      contentLength = bodyStream.length;
    } else if (util.isBlobLike(body) && request.contentType == null && body.type) {
      headers.push("content-type", body.type);
    }
    if (body && typeof body.read === "function") {
      body.read(0);
    }
    const bodyLength = util.bodyLength(body);
    contentLength = bodyLength ?? contentLength;
    if (contentLength === null) {
      contentLength = request.contentLength;
    }
    if (contentLength === 0 && !expectsPayload) {
      contentLength = null;
    }
    if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength !== null && request.contentLength !== contentLength) {
      if (client[kStrictContentLength]) {
        util.errorRequest(client, request, new RequestContentLengthMismatchError());
        return false;
      }
      process.emitWarning(new RequestContentLengthMismatchError());
    }
    const socket = client[kSocket];
    const abort = (err) => {
      if (request.aborted || request.completed) {
        return;
      }
      util.errorRequest(client, request, err || new RequestAbortedError());
      util.destroy(body);
      util.destroy(socket, new InformationalError("aborted"));
    };
    try {
      request.onConnect(abort);
    } catch (err) {
      util.errorRequest(client, request, err);
    }
    if (request.aborted) {
      return false;
    }
    if (method === "HEAD") {
      socket[kReset] = true;
    }
    if (upgrade || method === "CONNECT") {
      socket[kReset] = true;
    }
    if (reset != null) {
      socket[kReset] = reset;
    }
    if (client[kMaxRequests] && socket[kCounter]++ >= client[kMaxRequests]) {
      socket[kReset] = true;
    }
    if (blocking) {
      socket[kBlocking] = true;
    }
    let header = `${method} ${path} HTTP/1.1\r
`;
    if (typeof host === "string") {
      header += `host: ${host}\r
`;
    } else {
      header += client[kHostHeader];
    }
    if (upgrade) {
      header += `connection: upgrade\r
upgrade: ${upgrade}\r
`;
    } else if (client[kPipelining] && !socket[kReset]) {
      header += "connection: keep-alive\r\n";
    } else {
      header += "connection: close\r\n";
    }
    if (Array.isArray(headers)) {
      for (let n = 0; n < headers.length; n += 2) {
        const key = headers[n + 0];
        const val = headers[n + 1];
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            header += `${key}: ${val[i]}\r
`;
          }
        } else {
          header += `${key}: ${val}\r
`;
        }
      }
    }
    if (channels.sendHeaders.hasSubscribers) {
      channels.sendHeaders.publish({ request, headers: header, socket });
    }
    if (!body || bodyLength === 0) {
      writeBuffer(abort, null, client, request, socket, contentLength, header, expectsPayload);
    } else if (util.isBuffer(body)) {
      writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload);
    } else if (util.isBlobLike(body)) {
      if (typeof body.stream === "function") {
        writeIterable(abort, body.stream(), client, request, socket, contentLength, header, expectsPayload);
      } else {
        writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload);
      }
    } else if (util.isStream(body)) {
      writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload);
    } else if (util.isIterable(body)) {
      writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload);
    } else {
      assert(false);
    }
    return true;
  }
  function writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload) {
    assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
    let finished = false;
    const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header });
    const onData = function(chunk) {
      if (finished) {
        return;
      }
      try {
        if (!writer.write(chunk) && this.pause) {
          this.pause();
        }
      } catch (err) {
        util.destroy(this, err);
      }
    };
    const onDrain = function() {
      if (finished) {
        return;
      }
      if (body.resume) {
        body.resume();
      }
    };
    const onClose = function() {
      queueMicrotask(() => {
        body.removeListener("error", onFinished);
      });
      if (!finished) {
        const err = new RequestAbortedError();
        queueMicrotask(() => onFinished(err));
      }
    };
    const onFinished = function(err) {
      if (finished) {
        return;
      }
      finished = true;
      assert(socket.destroyed || socket[kWriting] && client[kRunning] <= 1);
      socket.off("drain", onDrain).off("error", onFinished);
      body.removeListener("data", onData).removeListener("end", onFinished).removeListener("close", onClose);
      if (!err) {
        try {
          writer.end();
        } catch (er) {
          err = er;
        }
      }
      writer.destroy(err);
      if (err && (err.code !== "UND_ERR_INFO" || err.message !== "reset")) {
        util.destroy(body, err);
      } else {
        util.destroy(body);
      }
    };
    body.on("data", onData).on("end", onFinished).on("error", onFinished).on("close", onClose);
    if (body.resume) {
      body.resume();
    }
    socket.on("drain", onDrain).on("error", onFinished);
    if (body.errorEmitted ?? body.errored) {
      setImmediate(onFinished, body.errored);
    } else if (body.endEmitted ?? body.readableEnded) {
      setImmediate(onFinished, null);
    }
    if (body.closeEmitted ?? body.closed) {
      setImmediate(onClose);
    }
  }
  function writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload) {
    try {
      if (!body) {
        if (contentLength === 0) {
          socket.write(`${header}content-length: 0\r
\r
`, "latin1");
        } else {
          assert(contentLength === null, "no body must not have content length");
          socket.write(`${header}\r
`, "latin1");
        }
      } else if (util.isBuffer(body)) {
        assert(contentLength === body.byteLength, "buffer body must have content length");
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
        socket.write(body);
        socket.uncork();
        request.onBodySent(body);
        if (!expectsPayload && request.reset !== false) {
          socket[kReset] = true;
        }
      }
      request.onRequestSent();
      client[kResume]();
    } catch (err) {
      abort(err);
    }
  }
  async function writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload) {
    assert(contentLength === body.size, "blob body must have content length");
    try {
      if (contentLength != null && contentLength !== body.size) {
        throw new RequestContentLengthMismatchError();
      }
      const buffer = Buffer.from(await body.arrayBuffer());
      socket.cork();
      socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
      socket.write(buffer);
      socket.uncork();
      request.onBodySent(buffer);
      request.onRequestSent();
      if (!expectsPayload && request.reset !== false) {
        socket[kReset] = true;
      }
      client[kResume]();
    } catch (err) {
      abort(err);
    }
  }
  async function writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload) {
    assert(contentLength !== 0 || client[kRunning] === 0, "iterator body cannot be pipelined");
    let callback = null;
    function onDrain() {
      if (callback) {
        const cb = callback;
        callback = null;
        cb();
      }
    }
    const waitForDrain = () => new Promise((resolve, reject) => {
      assert(callback === null);
      if (socket[kError]) {
        reject(socket[kError]);
      } else {
        callback = resolve;
      }
    });
    socket.on("close", onDrain).on("drain", onDrain);
    const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header });
    try {
      for await (const chunk of body) {
        if (socket[kError]) {
          throw socket[kError];
        }
        if (!writer.write(chunk)) {
          await waitForDrain();
        }
      }
      writer.end();
    } catch (err) {
      writer.destroy(err);
    } finally {
      socket.off("close", onDrain).off("drain", onDrain);
    }
  }
  class AsyncWriter {
    /**
     *
     * @param {object} arg
     * @param {AbortCallback} arg.abort
     * @param {import('net').Socket} arg.socket
     * @param {import('../core/request.js')} arg.request
     * @param {number} arg.contentLength
     * @param {import('./client.js')} arg.client
     * @param {boolean} arg.expectsPayload
     * @param {string} arg.header
     */
    constructor({ abort, socket, request, contentLength, client, expectsPayload, header }) {
      this.socket = socket;
      this.request = request;
      this.contentLength = contentLength;
      this.client = client;
      this.bytesWritten = 0;
      this.expectsPayload = expectsPayload;
      this.header = header;
      this.abort = abort;
      socket[kWriting] = true;
    }
    /**
     * @param {Buffer} chunk
     * @returns
     */
    write(chunk) {
      const { socket, request, contentLength, client, bytesWritten, expectsPayload, header } = this;
      if (socket[kError]) {
        throw socket[kError];
      }
      if (socket.destroyed) {
        return false;
      }
      const len = Buffer.byteLength(chunk);
      if (!len) {
        return true;
      }
      if (contentLength !== null && bytesWritten + len > contentLength) {
        if (client[kStrictContentLength]) {
          throw new RequestContentLengthMismatchError();
        }
        process.emitWarning(new RequestContentLengthMismatchError());
      }
      socket.cork();
      if (bytesWritten === 0) {
        if (!expectsPayload && request.reset !== false) {
          socket[kReset] = true;
        }
        if (contentLength === null) {
          socket.write(`${header}transfer-encoding: chunked\r
`, "latin1");
        } else {
          socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
        }
      }
      if (contentLength === null) {
        socket.write(`\r
${len.toString(16)}\r
`, "latin1");
      }
      this.bytesWritten += len;
      const ret = socket.write(chunk);
      socket.uncork();
      request.onBodySent(chunk);
      if (!ret) {
        if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
          if (socket[kParser].timeout.refresh) {
            socket[kParser].timeout.refresh();
          }
        }
      }
      return ret;
    }
    /**
     * @returns {void}
     */
    end() {
      const { socket, contentLength, client, bytesWritten, expectsPayload, header, request } = this;
      request.onRequestSent();
      socket[kWriting] = false;
      if (socket[kError]) {
        throw socket[kError];
      }
      if (socket.destroyed) {
        return;
      }
      if (bytesWritten === 0) {
        if (expectsPayload) {
          socket.write(`${header}content-length: 0\r
\r
`, "latin1");
        } else {
          socket.write(`${header}\r
`, "latin1");
        }
      } else if (contentLength === null) {
        socket.write("\r\n0\r\n\r\n", "latin1");
      }
      if (contentLength !== null && bytesWritten !== contentLength) {
        if (client[kStrictContentLength]) {
          throw new RequestContentLengthMismatchError();
        } else {
          process.emitWarning(new RequestContentLengthMismatchError());
        }
      }
      if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
        if (socket[kParser].timeout.refresh) {
          socket[kParser].timeout.refresh();
        }
      }
      client[kResume]();
    }
    /**
     * @param {Error} [err]
     * @returns {void}
     */
    destroy(err) {
      const { socket, client, abort } = this;
      socket[kWriting] = false;
      if (err) {
        assert(client[kRunning] <= 1, "pipeline should only contain this request");
        abort(err);
      }
    }
  }
  clientH1 = connectH1;
  return clientH1;
}
export {
  requireClientH1 as __require
};
//# sourceMappingURL=index65.js.map
