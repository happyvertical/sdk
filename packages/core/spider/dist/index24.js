import require$$0 from "node:assert";
import { __require as requireSymbols } from "./index53.js";
import require$$2 from "node:http";
import require$$0$1 from "node:stream";
import require$$0$2 from "node:net";
import require$$5 from "node:querystring";
import require$$6 from "node:events";
import { __require as requireTimers } from "./index69.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireConstants } from "./index70.js";
import { __require as requireTree } from "./index71.js";
var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  const assert = require$$0;
  const { kDestroyed, kBodyUsed, kListeners, kBody } = requireSymbols();
  const { IncomingMessage } = require$$2;
  const stream = require$$0$1;
  const net = require$$0$2;
  const { stringify } = require$$5;
  const { EventEmitter: EE } = require$$6;
  const timers = requireTimers();
  const { InvalidArgumentError, ConnectTimeoutError } = requireErrors();
  const { headerNameLowerCasedRecord } = requireConstants();
  const { tree } = requireTree();
  const [nodeMajor, nodeMinor] = process.versions.node.split(".", 2).map((v) => Number(v));
  class BodyAsyncIterable {
    constructor(body) {
      this[kBody] = body;
      this[kBodyUsed] = false;
    }
    async *[Symbol.asyncIterator]() {
      assert(!this[kBodyUsed], "disturbed");
      this[kBodyUsed] = true;
      yield* this[kBody];
    }
  }
  function noop() {
  }
  function wrapRequestBody(body) {
    if (isStream(body)) {
      if (bodyLength(body) === 0) {
        body.on("data", function() {
          assert(false);
        });
      }
      if (typeof body.readableDidRead !== "boolean") {
        body[kBodyUsed] = false;
        EE.prototype.on.call(body, "data", function() {
          this[kBodyUsed] = true;
        });
      }
      return body;
    } else if (body && typeof body.pipeTo === "function") {
      return new BodyAsyncIterable(body);
    } else if (body && typeof body !== "string" && !ArrayBuffer.isView(body) && isIterable(body)) {
      return new BodyAsyncIterable(body);
    } else {
      return body;
    }
  }
  function isStream(obj) {
    return obj && typeof obj === "object" && typeof obj.pipe === "function" && typeof obj.on === "function";
  }
  function isBlobLike(object) {
    if (object === null) {
      return false;
    } else if (object instanceof Blob) {
      return true;
    } else if (typeof object !== "object") {
      return false;
    } else {
      const sTag = object[Symbol.toStringTag];
      return (sTag === "Blob" || sTag === "File") && ("stream" in object && typeof object.stream === "function" || "arrayBuffer" in object && typeof object.arrayBuffer === "function");
    }
  }
  function pathHasQueryOrFragment(url) {
    return url.includes("?") || url.includes("#");
  }
  function serializePathWithQuery(url, queryParams) {
    if (pathHasQueryOrFragment(url)) {
      throw new Error('Query params cannot be passed when url already contains "?" or "#".');
    }
    const stringified = stringify(queryParams);
    if (stringified) {
      url += "?" + stringified;
    }
    return url;
  }
  function isValidPort(port) {
    const value = parseInt(port, 10);
    return value === Number(port) && value >= 0 && value <= 65535;
  }
  function isHttpOrHttpsPrefixed(value) {
    return value != null && value[0] === "h" && value[1] === "t" && value[2] === "t" && value[3] === "p" && (value[4] === ":" || value[4] === "s" && value[5] === ":");
  }
  function parseURL(url) {
    if (typeof url === "string") {
      url = new URL(url);
      if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
        throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
      }
      return url;
    }
    if (!url || typeof url !== "object") {
      throw new InvalidArgumentError("Invalid URL: The URL argument must be a non-null object.");
    }
    if (!(url instanceof URL)) {
      if (url.port != null && url.port !== "" && isValidPort(url.port) === false) {
        throw new InvalidArgumentError("Invalid URL: port must be a valid integer or a string representation of an integer.");
      }
      if (url.path != null && typeof url.path !== "string") {
        throw new InvalidArgumentError("Invalid URL path: the path must be a string or null/undefined.");
      }
      if (url.pathname != null && typeof url.pathname !== "string") {
        throw new InvalidArgumentError("Invalid URL pathname: the pathname must be a string or null/undefined.");
      }
      if (url.hostname != null && typeof url.hostname !== "string") {
        throw new InvalidArgumentError("Invalid URL hostname: the hostname must be a string or null/undefined.");
      }
      if (url.origin != null && typeof url.origin !== "string") {
        throw new InvalidArgumentError("Invalid URL origin: the origin must be a string or null/undefined.");
      }
      if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
        throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
      }
      const port = url.port != null ? url.port : url.protocol === "https:" ? 443 : 80;
      let origin = url.origin != null ? url.origin : `${url.protocol || ""}//${url.hostname || ""}:${port}`;
      let path = url.path != null ? url.path : `${url.pathname || ""}${url.search || ""}`;
      if (origin[origin.length - 1] === "/") {
        origin = origin.slice(0, origin.length - 1);
      }
      if (path && path[0] !== "/") {
        path = `/${path}`;
      }
      return new URL(`${origin}${path}`);
    }
    if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
      throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
    }
    return url;
  }
  function parseOrigin(url) {
    url = parseURL(url);
    if (url.pathname !== "/" || url.search || url.hash) {
      throw new InvalidArgumentError("invalid url");
    }
    return url;
  }
  function getHostname(host) {
    if (host[0] === "[") {
      const idx2 = host.indexOf("]");
      assert(idx2 !== -1);
      return host.substring(1, idx2);
    }
    const idx = host.indexOf(":");
    if (idx === -1) return host;
    return host.substring(0, idx);
  }
  function getServerName(host) {
    if (!host) {
      return null;
    }
    assert(typeof host === "string");
    const servername = getHostname(host);
    if (net.isIP(servername)) {
      return "";
    }
    return servername;
  }
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  function isAsyncIterable(obj) {
    return !!(obj != null && typeof obj[Symbol.asyncIterator] === "function");
  }
  function isIterable(obj) {
    return !!(obj != null && (typeof obj[Symbol.iterator] === "function" || typeof obj[Symbol.asyncIterator] === "function"));
  }
  function bodyLength(body) {
    if (body == null) {
      return 0;
    } else if (isStream(body)) {
      const state = body._readableState;
      return state && state.objectMode === false && state.ended === true && Number.isFinite(state.length) ? state.length : null;
    } else if (isBlobLike(body)) {
      return body.size != null ? body.size : null;
    } else if (isBuffer(body)) {
      return body.byteLength;
    }
    return null;
  }
  function isDestroyed(body) {
    return body && !!(body.destroyed || body[kDestroyed] || stream.isDestroyed?.(body));
  }
  function destroy(stream2, err) {
    if (stream2 == null || !isStream(stream2) || isDestroyed(stream2)) {
      return;
    }
    if (typeof stream2.destroy === "function") {
      if (Object.getPrototypeOf(stream2).constructor === IncomingMessage) {
        stream2.socket = null;
      }
      stream2.destroy(err);
    } else if (err) {
      queueMicrotask(() => {
        stream2.emit("error", err);
      });
    }
    if (stream2.destroyed !== true) {
      stream2[kDestroyed] = true;
    }
  }
  const KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/;
  function parseKeepAliveTimeout(val) {
    const m = val.match(KEEPALIVE_TIMEOUT_EXPR);
    return m ? parseInt(m[1], 10) * 1e3 : null;
  }
  function headerNameToString(value) {
    return typeof value === "string" ? headerNameLowerCasedRecord[value] ?? value.toLowerCase() : tree.lookup(value) ?? value.toString("latin1").toLowerCase();
  }
  function bufferToLowerCasedHeaderName(value) {
    return tree.lookup(value) ?? value.toString("latin1").toLowerCase();
  }
  function parseHeaders(headers, obj) {
    if (obj === void 0) obj = {};
    for (let i = 0; i < headers.length; i += 2) {
      const key = headerNameToString(headers[i]);
      let val = obj[key];
      if (val) {
        if (typeof val === "string") {
          val = [val];
          obj[key] = val;
        }
        val.push(headers[i + 1].toString("utf8"));
      } else {
        const headersValue = headers[i + 1];
        if (typeof headersValue === "string") {
          obj[key] = headersValue;
        } else {
          obj[key] = Array.isArray(headersValue) ? headersValue.map((x) => x.toString("utf8")) : headersValue.toString("utf8");
        }
      }
    }
    if ("content-length" in obj && "content-disposition" in obj) {
      obj["content-disposition"] = Buffer.from(obj["content-disposition"]).toString("latin1");
    }
    return obj;
  }
  function parseRawHeaders(headers) {
    const headersLength = headers.length;
    const ret = new Array(headersLength);
    let hasContentLength = false;
    let contentDispositionIdx = -1;
    let key;
    let val;
    let kLen = 0;
    for (let n = 0; n < headersLength; n += 2) {
      key = headers[n];
      val = headers[n + 1];
      typeof key !== "string" && (key = key.toString());
      typeof val !== "string" && (val = val.toString("utf8"));
      kLen = key.length;
      if (kLen === 14 && key[7] === "-" && (key === "content-length" || key.toLowerCase() === "content-length")) {
        hasContentLength = true;
      } else if (kLen === 19 && key[7] === "-" && (key === "content-disposition" || key.toLowerCase() === "content-disposition")) {
        contentDispositionIdx = n + 1;
      }
      ret[n] = key;
      ret[n + 1] = val;
    }
    if (hasContentLength && contentDispositionIdx !== -1) {
      ret[contentDispositionIdx] = Buffer.from(ret[contentDispositionIdx]).toString("latin1");
    }
    return ret;
  }
  function encodeRawHeaders(headers) {
    if (!Array.isArray(headers)) {
      throw new TypeError("expected headers to be an array");
    }
    return headers.map((x) => Buffer.from(x));
  }
  function isBuffer(buffer) {
    return buffer instanceof Uint8Array || Buffer.isBuffer(buffer);
  }
  function assertRequestHandler(handler, method, upgrade) {
    if (!handler || typeof handler !== "object") {
      throw new InvalidArgumentError("handler must be an object");
    }
    if (typeof handler.onRequestStart === "function") {
      return;
    }
    if (typeof handler.onConnect !== "function") {
      throw new InvalidArgumentError("invalid onConnect method");
    }
    if (typeof handler.onError !== "function") {
      throw new InvalidArgumentError("invalid onError method");
    }
    if (typeof handler.onBodySent !== "function" && handler.onBodySent !== void 0) {
      throw new InvalidArgumentError("invalid onBodySent method");
    }
    if (upgrade || method === "CONNECT") {
      if (typeof handler.onUpgrade !== "function") {
        throw new InvalidArgumentError("invalid onUpgrade method");
      }
    } else {
      if (typeof handler.onHeaders !== "function") {
        throw new InvalidArgumentError("invalid onHeaders method");
      }
      if (typeof handler.onData !== "function") {
        throw new InvalidArgumentError("invalid onData method");
      }
      if (typeof handler.onComplete !== "function") {
        throw new InvalidArgumentError("invalid onComplete method");
      }
    }
  }
  function isDisturbed(body) {
    return !!(body && (stream.isDisturbed(body) || body[kBodyUsed]));
  }
  function getSocketInfo(socket) {
    return {
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      remoteFamily: socket.remoteFamily,
      timeout: socket.timeout,
      bytesWritten: socket.bytesWritten,
      bytesRead: socket.bytesRead
    };
  }
  function ReadableStreamFrom(iterable) {
    let iterator;
    return new ReadableStream(
      {
        start() {
          iterator = iterable[Symbol.asyncIterator]();
        },
        pull(controller) {
          return iterator.next().then(({ done, value }) => {
            if (done) {
              queueMicrotask(() => {
                controller.close();
                controller.byobRequest?.respond(0);
              });
            } else {
              const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
              if (buf.byteLength) {
                controller.enqueue(new Uint8Array(buf));
              } else {
                return this.pull(controller);
              }
            }
          });
        },
        cancel() {
          return iterator.return();
        },
        type: "bytes"
      }
    );
  }
  function isFormDataLike(object) {
    return object && typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && object[Symbol.toStringTag] === "FormData";
  }
  function addAbortListener(signal, listener) {
    if ("addEventListener" in signal) {
      signal.addEventListener("abort", listener, { once: true });
      return () => signal.removeEventListener("abort", listener);
    }
    signal.once("abort", listener);
    return () => signal.removeListener("abort", listener);
  }
  function isTokenCharCode(c) {
    switch (c) {
      case 34:
      case 40:
      case 41:
      case 44:
      case 47:
      case 58:
      case 59:
      case 60:
      case 61:
      case 62:
      case 63:
      case 64:
      case 91:
      case 92:
      case 93:
      case 123:
      case 125:
        return false;
      default:
        return c >= 33 && c <= 126;
    }
  }
  function isValidHTTPToken(characters) {
    if (characters.length === 0) {
      return false;
    }
    for (let i = 0; i < characters.length; ++i) {
      if (!isTokenCharCode(characters.charCodeAt(i))) {
        return false;
      }
    }
    return true;
  }
  const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
  function isValidHeaderValue(characters) {
    return !headerCharRegex.test(characters);
  }
  const rangeHeaderRegex = /^bytes (\d+)-(\d+)\/(\d+)?$/;
  function parseRangeHeader(range) {
    if (range == null || range === "") return { start: 0, end: null, size: null };
    const m = range ? range.match(rangeHeaderRegex) : null;
    return m ? {
      start: parseInt(m[1]),
      end: m[2] ? parseInt(m[2]) : null,
      size: m[3] ? parseInt(m[3]) : null
    } : null;
  }
  function addListener(obj, name, listener) {
    const listeners = obj[kListeners] ??= [];
    listeners.push([name, listener]);
    obj.on(name, listener);
    return obj;
  }
  function removeAllListeners(obj) {
    if (obj[kListeners] != null) {
      for (const [name, listener] of obj[kListeners]) {
        obj.removeListener(name, listener);
      }
      obj[kListeners] = null;
    }
    return obj;
  }
  function errorRequest(client, request, err) {
    try {
      request.onError(err);
      assert(request.aborted);
    } catch (err2) {
      client.emit("error", err2);
    }
  }
  const setupConnectTimeout = process.platform === "win32" ? (socketWeakRef, opts) => {
    if (!opts.timeout) {
      return noop;
    }
    let s1 = null;
    let s2 = null;
    const fastTimer = timers.setFastTimeout(() => {
      s1 = setImmediate(() => {
        s2 = setImmediate(() => onConnectTimeout(socketWeakRef.deref(), opts));
      });
    }, opts.timeout);
    return () => {
      timers.clearFastTimeout(fastTimer);
      clearImmediate(s1);
      clearImmediate(s2);
    };
  } : (socketWeakRef, opts) => {
    if (!opts.timeout) {
      return noop;
    }
    let s1 = null;
    const fastTimer = timers.setFastTimeout(() => {
      s1 = setImmediate(() => {
        onConnectTimeout(socketWeakRef.deref(), opts);
      });
    }, opts.timeout);
    return () => {
      timers.clearFastTimeout(fastTimer);
      clearImmediate(s1);
    };
  };
  function onConnectTimeout(socket, opts) {
    if (socket == null) {
      return;
    }
    let message = "Connect Timeout Error";
    if (Array.isArray(socket.autoSelectFamilyAttemptedAddresses)) {
      message += ` (attempted addresses: ${socket.autoSelectFamilyAttemptedAddresses.join(", ")},`;
    } else {
      message += ` (attempted address: ${opts.hostname}:${opts.port},`;
    }
    message += ` timeout: ${opts.timeout}ms)`;
    destroy(socket, new ConnectTimeoutError(message));
  }
  function getProtocolFromUrlString(urlString) {
    if (urlString[0] === "h" && urlString[1] === "t" && urlString[2] === "t" && urlString[3] === "p") {
      switch (urlString[4]) {
        case ":":
          return "http:";
        case "s":
          if (urlString[5] === ":") {
            return "https:";
          }
      }
    }
    return urlString.slice(0, urlString.indexOf(":") + 1);
  }
  const kEnumerableProperty = /* @__PURE__ */ Object.create(null);
  kEnumerableProperty.enumerable = true;
  const normalizedMethodRecordsBase = {
    delete: "DELETE",
    DELETE: "DELETE",
    get: "GET",
    GET: "GET",
    head: "HEAD",
    HEAD: "HEAD",
    options: "OPTIONS",
    OPTIONS: "OPTIONS",
    post: "POST",
    POST: "POST",
    put: "PUT",
    PUT: "PUT"
  };
  const normalizedMethodRecords = {
    ...normalizedMethodRecordsBase,
    patch: "patch",
    PATCH: "PATCH"
  };
  Object.setPrototypeOf(normalizedMethodRecordsBase, null);
  Object.setPrototypeOf(normalizedMethodRecords, null);
  util = {
    kEnumerableProperty,
    isDisturbed,
    isBlobLike,
    parseOrigin,
    parseURL,
    getServerName,
    isStream,
    isIterable,
    isAsyncIterable,
    isDestroyed,
    headerNameToString,
    bufferToLowerCasedHeaderName,
    addListener,
    removeAllListeners,
    errorRequest,
    parseRawHeaders,
    encodeRawHeaders,
    parseHeaders,
    parseKeepAliveTimeout,
    destroy,
    bodyLength,
    deepClone,
    ReadableStreamFrom,
    isBuffer,
    assertRequestHandler,
    getSocketInfo,
    isFormDataLike,
    pathHasQueryOrFragment,
    serializePathWithQuery,
    addAbortListener,
    isValidHTTPToken,
    isValidHeaderValue,
    isTokenCharCode,
    parseRangeHeader,
    normalizedMethodRecordsBase,
    normalizedMethodRecords,
    isValidPort,
    isHttpOrHttpsPrefixed,
    nodeMajor,
    nodeMinor,
    safeHTTPMethods: Object.freeze(["GET", "HEAD", "OPTIONS", "TRACE"]),
    wrapRequestBody,
    setupConnectTimeout,
    getProtocolFromUrlString
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index24.js.map
