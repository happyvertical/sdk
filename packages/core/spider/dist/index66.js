import require$$0$1 from "node:assert";
import require$$0 from "node:stream";
import { __require as requireUtil } from "./index24.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireDiagnostics } from "./index62.js";
import { __require as requireBody } from "./index89.js";
var clientH2;
var hasRequiredClientH2;
function requireClientH2() {
  if (hasRequiredClientH2) return clientH2;
  hasRequiredClientH2 = 1;
  const assert = require$$0$1;
  const { pipeline } = require$$0;
  const util = requireUtil();
  const {
    RequestContentLengthMismatchError,
    RequestAbortedError,
    SocketError,
    InformationalError
  } = requireErrors();
  const {
    kUrl,
    kReset,
    kClient,
    kRunning,
    kPending,
    kQueue,
    kPendingIdx,
    kRunningIdx,
    kError,
    kSocket,
    kStrictContentLength,
    kOnError,
    kMaxConcurrentStreams,
    kHTTP2Session,
    kResume,
    kSize,
    kHTTPContext,
    kClosed,
    kBodyTimeout
  } = requireSymbols();
  const { channels } = requireDiagnostics();
  const kOpenStreams = Symbol("open streams");
  let extractBody;
  let http2;
  try {
    http2 = require("node:http2");
  } catch {
    http2 = { constants: {} };
  }
  const {
    constants: {
      HTTP2_HEADER_AUTHORITY,
      HTTP2_HEADER_METHOD,
      HTTP2_HEADER_PATH,
      HTTP2_HEADER_SCHEME,
      HTTP2_HEADER_CONTENT_LENGTH,
      HTTP2_HEADER_EXPECT,
      HTTP2_HEADER_STATUS
    }
  } = http2;
  function parseH2Headers(headers) {
    const result = [];
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const subvalue of value) {
          result.push(Buffer.from(name), Buffer.from(subvalue));
        }
      } else {
        result.push(Buffer.from(name), Buffer.from(value));
      }
    }
    return result;
  }
  function connectH2(client, socket) {
    client[kSocket] = socket;
    const session = http2.connect(client[kUrl], {
      createConnection: () => socket,
      peerMaxConcurrentStreams: client[kMaxConcurrentStreams],
      settings: {
        // TODO(metcoder95): add support for PUSH
        enablePush: false
      }
    });
    session[kOpenStreams] = 0;
    session[kClient] = client;
    session[kSocket] = socket;
    session[kHTTP2Session] = null;
    util.addListener(session, "error", onHttp2SessionError);
    util.addListener(session, "frameError", onHttp2FrameError);
    util.addListener(session, "end", onHttp2SessionEnd);
    util.addListener(session, "goaway", onHttp2SessionGoAway);
    util.addListener(session, "close", onHttp2SessionClose);
    session.unref();
    client[kHTTP2Session] = session;
    socket[kHTTP2Session] = session;
    util.addListener(socket, "error", onHttp2SocketError);
    util.addListener(socket, "end", onHttp2SocketEnd);
    util.addListener(socket, "close", onHttp2SocketClose);
    socket[kClosed] = false;
    socket.on("close", onSocketClose);
    return {
      version: "h2",
      defaultPipelining: Infinity,
      write(request) {
        return writeH2(client, request);
      },
      resume() {
        resumeH2(client);
      },
      destroy(err, callback) {
        if (socket[kClosed]) {
          queueMicrotask(callback);
        } else {
          socket.destroy(err).on("close", callback);
        }
      },
      get destroyed() {
        return socket.destroyed;
      },
      busy() {
        return false;
      }
    };
  }
  function resumeH2(client) {
    const socket = client[kSocket];
    if (socket?.destroyed === false) {
      if (client[kSize] === 0 || client[kMaxConcurrentStreams] === 0) {
        socket.unref();
        client[kHTTP2Session].unref();
      } else {
        socket.ref();
        client[kHTTP2Session].ref();
      }
    }
  }
  function onHttp2SessionError(err) {
    assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
    this[kSocket][kError] = err;
    this[kClient][kOnError](err);
  }
  function onHttp2FrameError(type, code, id) {
    if (id === 0) {
      const err = new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`);
      this[kSocket][kError] = err;
      this[kClient][kOnError](err);
    }
  }
  function onHttp2SessionEnd() {
    const err = new SocketError("other side closed", util.getSocketInfo(this[kSocket]));
    this.destroy(err);
    util.destroy(this[kSocket], err);
  }
  function onHttp2SessionGoAway(errorCode) {
    const err = this[kError] || new SocketError(`HTTP/2: "GOAWAY" frame received with code ${errorCode}`, util.getSocketInfo(this[kSocket]));
    const client = this[kClient];
    client[kSocket] = null;
    client[kHTTPContext] = null;
    this.close();
    this[kHTTP2Session] = null;
    util.destroy(this[kSocket], err);
    if (client[kRunningIdx] < client[kQueue].length) {
      const request = client[kQueue][client[kRunningIdx]];
      client[kQueue][client[kRunningIdx]++] = null;
      util.errorRequest(client, request, err);
      client[kPendingIdx] = client[kRunningIdx];
    }
    assert(client[kRunning] === 0);
    client.emit("disconnect", client[kUrl], [client], err);
    client.emit("connectionError", client[kUrl], [client], err);
    client[kResume]();
  }
  function onHttp2SessionClose() {
    const { [kClient]: client } = this;
    const { [kSocket]: socket } = client;
    const err = this[kSocket][kError] || this[kError] || new SocketError("closed", util.getSocketInfo(socket));
    client[kSocket] = null;
    client[kHTTPContext] = null;
    if (client.destroyed) {
      assert(client[kPending] === 0);
      const requests = client[kQueue].splice(client[kRunningIdx]);
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        util.errorRequest(client, request, err);
      }
    }
  }
  function onHttp2SocketClose() {
    const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
    const client = this[kHTTP2Session][kClient];
    client[kSocket] = null;
    client[kHTTPContext] = null;
    if (this[kHTTP2Session] !== null) {
      this[kHTTP2Session].destroy(err);
    }
    client[kPendingIdx] = client[kRunningIdx];
    assert(client[kRunning] === 0);
    client.emit("disconnect", client[kUrl], [client], err);
    client[kResume]();
  }
  function onHttp2SocketError(err) {
    assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
    this[kError] = err;
    this[kClient][kOnError](err);
  }
  function onHttp2SocketEnd() {
    util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
  }
  function onSocketClose() {
    this[kClosed] = true;
  }
  function shouldSendContentLength(method) {
    return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
  }
  function writeH2(client, request) {
    const requestTimeout = request.bodyTimeout ?? client[kBodyTimeout];
    const session = client[kHTTP2Session];
    const { method, path, host, upgrade, expectContinue, signal, protocol, headers: reqHeaders } = request;
    let { body } = request;
    if (upgrade) {
      util.errorRequest(client, request, new Error("Upgrade not supported for H2"));
      return false;
    }
    const headers = {};
    for (let n = 0; n < reqHeaders.length; n += 2) {
      const key = reqHeaders[n + 0];
      const val = reqHeaders[n + 1];
      if (key === "cookie") {
        if (headers[key] != null) {
          headers[key] = Array.isArray(headers[key]) ? (headers[key].push(val), headers[key]) : [headers[key], val];
        } else {
          headers[key] = val;
        }
        continue;
      }
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          if (headers[key]) {
            headers[key] += `, ${val[i]}`;
          } else {
            headers[key] = val[i];
          }
        }
      } else if (headers[key]) {
        headers[key] += `, ${val}`;
      } else {
        headers[key] = val;
      }
    }
    let stream = null;
    const { hostname, port } = client[kUrl];
    headers[HTTP2_HEADER_AUTHORITY] = host || `${hostname}${port ? `:${port}` : ""}`;
    headers[HTTP2_HEADER_METHOD] = method;
    const abort = (err) => {
      if (request.aborted || request.completed) {
        return;
      }
      err = err || new RequestAbortedError();
      util.errorRequest(client, request, err);
      if (stream != null) {
        stream.removeAllListeners("data");
        stream.close();
        client[kOnError](err);
        client[kResume]();
      }
      util.destroy(body, err);
    };
    try {
      request.onConnect(abort);
    } catch (err) {
      util.errorRequest(client, request, err);
    }
    if (request.aborted) {
      return false;
    }
    if (method === "CONNECT") {
      session.ref();
      stream = session.request(headers, { endStream: false, signal });
      if (!stream.pending) {
        request.onUpgrade(null, null, stream);
        ++session[kOpenStreams];
        client[kQueue][client[kRunningIdx]++] = null;
      } else {
        stream.once("ready", () => {
          request.onUpgrade(null, null, stream);
          ++session[kOpenStreams];
          client[kQueue][client[kRunningIdx]++] = null;
        });
      }
      stream.once("close", () => {
        session[kOpenStreams] -= 1;
        if (session[kOpenStreams] === 0) session.unref();
      });
      stream.setTimeout(requestTimeout);
      return true;
    }
    headers[HTTP2_HEADER_PATH] = path;
    headers[HTTP2_HEADER_SCHEME] = protocol === "http:" ? "http" : "https";
    const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH";
    if (body && typeof body.read === "function") {
      body.read(0);
    }
    let contentLength = util.bodyLength(body);
    if (util.isFormDataLike(body)) {
      extractBody ??= requireBody().extractBody;
      const [bodyStream, contentType] = extractBody(body);
      headers["content-type"] = contentType;
      body = bodyStream.stream;
      contentLength = bodyStream.length;
    }
    if (contentLength == null) {
      contentLength = request.contentLength;
    }
    if (contentLength === 0 || !expectsPayload) {
      contentLength = null;
    }
    if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength != null && request.contentLength !== contentLength) {
      if (client[kStrictContentLength]) {
        util.errorRequest(client, request, new RequestContentLengthMismatchError());
        return false;
      }
      process.emitWarning(new RequestContentLengthMismatchError());
    }
    if (contentLength != null) {
      assert(body, "no body must not have content length");
      headers[HTTP2_HEADER_CONTENT_LENGTH] = `${contentLength}`;
    }
    session.ref();
    if (channels.sendHeaders.hasSubscribers) {
      let header = "";
      for (const key in headers) {
        header += `${key}: ${headers[key]}\r
`;
      }
      channels.sendHeaders.publish({ request, headers: header, socket: session[kSocket] });
    }
    const shouldEndStream = method === "GET" || method === "HEAD" || body === null;
    if (expectContinue) {
      headers[HTTP2_HEADER_EXPECT] = "100-continue";
      stream = session.request(headers, { endStream: shouldEndStream, signal });
      stream.once("continue", writeBodyH2);
    } else {
      stream = session.request(headers, {
        endStream: shouldEndStream,
        signal
      });
      writeBodyH2();
    }
    ++session[kOpenStreams];
    stream.setTimeout(requestTimeout);
    stream.once("response", (headers2) => {
      const { [HTTP2_HEADER_STATUS]: statusCode, ...realHeaders } = headers2;
      request.onResponseStarted();
      if (request.aborted) {
        stream.removeAllListeners("data");
        return;
      }
      if (request.onHeaders(Number(statusCode), parseH2Headers(realHeaders), stream.resume.bind(stream), "") === false) {
        stream.pause();
      }
    });
    stream.on("data", (chunk) => {
      if (request.onData(chunk) === false) {
        stream.pause();
      }
    });
    stream.once("end", (err) => {
      stream.removeAllListeners("data");
      if (stream.state?.state == null || stream.state.state < 6) {
        if (!request.aborted && !request.completed) {
          request.onComplete({});
        }
        client[kQueue][client[kRunningIdx]++] = null;
        client[kResume]();
      } else {
        --session[kOpenStreams];
        if (session[kOpenStreams] === 0) {
          session.unref();
        }
        abort(err ?? new InformationalError("HTTP/2: stream half-closed (remote)"));
        client[kQueue][client[kRunningIdx]++] = null;
        client[kPendingIdx] = client[kRunningIdx];
        client[kResume]();
      }
    });
    stream.once("close", () => {
      stream.removeAllListeners("data");
      session[kOpenStreams] -= 1;
      if (session[kOpenStreams] === 0) {
        session.unref();
      }
    });
    stream.once("error", function(err) {
      stream.removeAllListeners("data");
      abort(err);
    });
    stream.once("frameError", (type, code) => {
      stream.removeAllListeners("data");
      abort(new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`));
    });
    stream.on("aborted", () => {
      stream.removeAllListeners("data");
    });
    stream.on("timeout", () => {
      const err = new InformationalError(`HTTP/2: "stream timeout after ${requestTimeout}"`);
      stream.removeAllListeners("data");
      session[kOpenStreams] -= 1;
      if (session[kOpenStreams] === 0) {
        session.unref();
      }
      abort(err);
    });
    stream.once("trailers", (trailers) => {
      if (request.aborted || request.completed) {
        return;
      }
      request.onComplete(trailers);
    });
    return true;
    function writeBodyH2() {
      if (!body || contentLength === 0) {
        writeBuffer(
          abort,
          stream,
          null,
          client,
          request,
          client[kSocket],
          contentLength,
          expectsPayload
        );
      } else if (util.isBuffer(body)) {
        writeBuffer(
          abort,
          stream,
          body,
          client,
          request,
          client[kSocket],
          contentLength,
          expectsPayload
        );
      } else if (util.isBlobLike(body)) {
        if (typeof body.stream === "function") {
          writeIterable(
            abort,
            stream,
            body.stream(),
            client,
            request,
            client[kSocket],
            contentLength,
            expectsPayload
          );
        } else {
          writeBlob(
            abort,
            stream,
            body,
            client,
            request,
            client[kSocket],
            contentLength,
            expectsPayload
          );
        }
      } else if (util.isStream(body)) {
        writeStream(
          abort,
          client[kSocket],
          expectsPayload,
          stream,
          body,
          client,
          request,
          contentLength
        );
      } else if (util.isIterable(body)) {
        writeIterable(
          abort,
          stream,
          body,
          client,
          request,
          client[kSocket],
          contentLength,
          expectsPayload
        );
      } else {
        assert(false);
      }
    }
  }
  function writeBuffer(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
    try {
      if (body != null && util.isBuffer(body)) {
        assert(contentLength === body.byteLength, "buffer body must have content length");
        h2stream.cork();
        h2stream.write(body);
        h2stream.uncork();
        h2stream.end();
        request.onBodySent(body);
      }
      if (!expectsPayload) {
        socket[kReset] = true;
      }
      request.onRequestSent();
      client[kResume]();
    } catch (error) {
      abort(error);
    }
  }
  function writeStream(abort, socket, expectsPayload, h2stream, body, client, request, contentLength) {
    assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
    const pipe = pipeline(
      body,
      h2stream,
      (err) => {
        if (err) {
          util.destroy(pipe, err);
          abort(err);
        } else {
          util.removeAllListeners(pipe);
          request.onRequestSent();
          if (!expectsPayload) {
            socket[kReset] = true;
          }
          client[kResume]();
        }
      }
    );
    util.addListener(pipe, "data", onPipeData);
    function onPipeData(chunk) {
      request.onBodySent(chunk);
    }
  }
  async function writeBlob(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
    assert(contentLength === body.size, "blob body must have content length");
    try {
      if (contentLength != null && contentLength !== body.size) {
        throw new RequestContentLengthMismatchError();
      }
      const buffer = Buffer.from(await body.arrayBuffer());
      h2stream.cork();
      h2stream.write(buffer);
      h2stream.uncork();
      h2stream.end();
      request.onBodySent(buffer);
      request.onRequestSent();
      if (!expectsPayload) {
        socket[kReset] = true;
      }
      client[kResume]();
    } catch (err) {
      abort(err);
    }
  }
  async function writeIterable(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
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
    h2stream.on("close", onDrain).on("drain", onDrain);
    try {
      for await (const chunk of body) {
        if (socket[kError]) {
          throw socket[kError];
        }
        const res = h2stream.write(chunk);
        request.onBodySent(chunk);
        if (!res) {
          await waitForDrain();
        }
      }
      h2stream.end();
      request.onRequestSent();
      if (!expectsPayload) {
        socket[kReset] = true;
      }
      client[kResume]();
    } catch (err) {
      abort(err);
    } finally {
      h2stream.off("close", onDrain).off("drain", onDrain);
    }
  }
  clientH2 = connectH2;
  return clientH2;
}
export {
  requireClientH2 as __require
};
//# sourceMappingURL=index66.js.map
