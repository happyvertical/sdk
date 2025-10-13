import require$$8 from "node:util/types";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireUtil } from "./index88.js";
import { __require as requireConstants } from "./index97.js";
import { __require as requireUtil$1 } from "./index98.js";
import { __require as requireConnection } from "./index99.js";
import { __require as requireReceiver } from "./index100.js";
import { __require as requireUtil$2 } from "./index24.js";
import { __require as requireGlobal } from "./index34.js";
import { __require as requireEvents } from "./index56.js";
import { __require as requireSender } from "./index101.js";
import { __require as requireFrame } from "./index102.js";
import { __require as requireDiagnostics } from "./index62.js";
var websocket;
var hasRequiredWebsocket;
function requireWebsocket() {
  if (hasRequiredWebsocket) return websocket;
  hasRequiredWebsocket = 1;
  const { isArrayBuffer } = require$$8;
  const { webidl } = requireWebidl();
  const { URLSerializer } = requireDataUrl();
  const { environmentSettingsObject } = requireUtil();
  const { staticPropertyDescriptors, states, sentCloseFrameState, sendHints, opcodes } = requireConstants();
  const {
    isConnecting,
    isEstablished,
    isClosing,
    isClosed,
    isValidSubprotocol,
    fireEvent,
    utf8Decode,
    toArrayBuffer,
    getURLRecord
  } = requireUtil$1();
  const { establishWebSocketConnection, closeWebSocketConnection, failWebsocketConnection } = requireConnection();
  const { ByteParser } = requireReceiver();
  const { kEnumerableProperty } = requireUtil$2();
  const { getGlobalDispatcher } = requireGlobal();
  const { ErrorEvent, CloseEvent, createFastMessageEvent } = requireEvents();
  const { SendQueue } = requireSender();
  const { WebsocketFrameSend } = requireFrame();
  const { channels } = requireDiagnostics();
  class WebSocket extends EventTarget {
    #events = {
      open: null,
      error: null,
      close: null,
      message: null
    };
    #bufferedAmount = 0;
    #protocol = "";
    #extensions = "";
    /** @type {SendQueue} */
    #sendQueue;
    /** @type {Handler} */
    #handler = {
      onConnectionEstablished: (response, extensions) => this.#onConnectionEstablished(response, extensions),
      onMessage: (opcode, data) => this.#onMessage(opcode, data),
      onParserError: (err) => failWebsocketConnection(this.#handler, null, err.message),
      onParserDrain: () => this.#onParserDrain(),
      onSocketData: (chunk) => {
        if (!this.#parser.write(chunk)) {
          this.#handler.socket.pause();
        }
      },
      onSocketError: (err) => {
        this.#handler.readyState = states.CLOSING;
        if (channels.socketError.hasSubscribers) {
          channels.socketError.publish(err);
        }
        this.#handler.socket.destroy();
      },
      onSocketClose: () => this.#onSocketClose(),
      onPing: (body) => {
        if (channels.ping.hasSubscribers) {
          channels.ping.publish({
            payload: body,
            websocket: this
          });
        }
      },
      onPong: (body) => {
        if (channels.pong.hasSubscribers) {
          channels.pong.publish({
            payload: body,
            websocket: this
          });
        }
      },
      readyState: states.CONNECTING,
      socket: null,
      closeState: /* @__PURE__ */ new Set(),
      controller: null,
      wasEverConnected: false
    };
    #url;
    #binaryType;
    /** @type {import('./receiver').ByteParser} */
    #parser;
    /**
     * @param {string} url
     * @param {string|string[]} protocols
     */
    constructor(url, protocols = []) {
      super();
      webidl.util.markAsUncloneable(this);
      const prefix = "WebSocket constructor";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      const options = webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"](protocols, prefix, "options");
      url = webidl.converters.USVString(url);
      protocols = options.protocols;
      const baseURL = environmentSettingsObject.settingsObject.baseUrl;
      const urlRecord = getURLRecord(url, baseURL);
      if (typeof protocols === "string") {
        protocols = [protocols];
      }
      if (protocols.length !== new Set(protocols.map((p) => p.toLowerCase())).size) {
        throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
      }
      if (protocols.length > 0 && !protocols.every((p) => isValidSubprotocol(p))) {
        throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
      }
      this.#url = new URL(urlRecord.href);
      const client = environmentSettingsObject.settingsObject;
      this.#handler.controller = establishWebSocketConnection(
        urlRecord,
        protocols,
        client,
        this.#handler,
        options
      );
      this.#handler.readyState = WebSocket.CONNECTING;
      this.#binaryType = "blob";
    }
    /**
     * @see https://websockets.spec.whatwg.org/#dom-websocket-close
     * @param {number|undefined} code
     * @param {string|undefined} reason
     */
    close(code = void 0, reason = void 0) {
      webidl.brandCheck(this, WebSocket);
      const prefix = "WebSocket.close";
      if (code !== void 0) {
        code = webidl.converters["unsigned short"](code, prefix, "code", webidl.attributes.Clamp);
      }
      if (reason !== void 0) {
        reason = webidl.converters.USVString(reason);
      }
      code ??= null;
      reason ??= "";
      closeWebSocketConnection(this.#handler, code, reason, true);
    }
    /**
     * @see https://websockets.spec.whatwg.org/#dom-websocket-send
     * @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
     */
    send(data) {
      webidl.brandCheck(this, WebSocket);
      const prefix = "WebSocket.send";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      data = webidl.converters.WebSocketSendData(data, prefix, "data");
      if (isConnecting(this.#handler.readyState)) {
        throw new DOMException("Sent before connected.", "InvalidStateError");
      }
      if (!isEstablished(this.#handler.readyState) || isClosing(this.#handler.readyState)) {
        return;
      }
      if (typeof data === "string") {
        const buffer = Buffer.from(data);
        this.#bufferedAmount += buffer.byteLength;
        this.#sendQueue.add(buffer, () => {
          this.#bufferedAmount -= buffer.byteLength;
        }, sendHints.text);
      } else if (isArrayBuffer(data)) {
        this.#bufferedAmount += data.byteLength;
        this.#sendQueue.add(data, () => {
          this.#bufferedAmount -= data.byteLength;
        }, sendHints.arrayBuffer);
      } else if (ArrayBuffer.isView(data)) {
        this.#bufferedAmount += data.byteLength;
        this.#sendQueue.add(data, () => {
          this.#bufferedAmount -= data.byteLength;
        }, sendHints.typedArray);
      } else if (webidl.is.Blob(data)) {
        this.#bufferedAmount += data.size;
        this.#sendQueue.add(data, () => {
          this.#bufferedAmount -= data.size;
        }, sendHints.blob);
      }
    }
    get readyState() {
      webidl.brandCheck(this, WebSocket);
      return this.#handler.readyState;
    }
    get bufferedAmount() {
      webidl.brandCheck(this, WebSocket);
      return this.#bufferedAmount;
    }
    get url() {
      webidl.brandCheck(this, WebSocket);
      return URLSerializer(this.#url);
    }
    get extensions() {
      webidl.brandCheck(this, WebSocket);
      return this.#extensions;
    }
    get protocol() {
      webidl.brandCheck(this, WebSocket);
      return this.#protocol;
    }
    get onopen() {
      webidl.brandCheck(this, WebSocket);
      return this.#events.open;
    }
    set onopen(fn) {
      webidl.brandCheck(this, WebSocket);
      if (this.#events.open) {
        this.removeEventListener("open", this.#events.open);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("open", listener);
        this.#events.open = fn;
      } else {
        this.#events.open = null;
      }
    }
    get onerror() {
      webidl.brandCheck(this, WebSocket);
      return this.#events.error;
    }
    set onerror(fn) {
      webidl.brandCheck(this, WebSocket);
      if (this.#events.error) {
        this.removeEventListener("error", this.#events.error);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("error", listener);
        this.#events.error = fn;
      } else {
        this.#events.error = null;
      }
    }
    get onclose() {
      webidl.brandCheck(this, WebSocket);
      return this.#events.close;
    }
    set onclose(fn) {
      webidl.brandCheck(this, WebSocket);
      if (this.#events.close) {
        this.removeEventListener("close", this.#events.close);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("close", listener);
        this.#events.close = fn;
      } else {
        this.#events.close = null;
      }
    }
    get onmessage() {
      webidl.brandCheck(this, WebSocket);
      return this.#events.message;
    }
    set onmessage(fn) {
      webidl.brandCheck(this, WebSocket);
      if (this.#events.message) {
        this.removeEventListener("message", this.#events.message);
      }
      const listener = webidl.converters.EventHandlerNonNull(fn);
      if (listener !== null) {
        this.addEventListener("message", listener);
        this.#events.message = fn;
      } else {
        this.#events.message = null;
      }
    }
    get binaryType() {
      webidl.brandCheck(this, WebSocket);
      return this.#binaryType;
    }
    set binaryType(type) {
      webidl.brandCheck(this, WebSocket);
      if (type !== "blob" && type !== "arraybuffer") {
        this.#binaryType = "blob";
      } else {
        this.#binaryType = type;
      }
    }
    /**
     * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
     */
    #onConnectionEstablished(response, parsedExtensions) {
      this.#handler.socket = response.socket;
      const parser = new ByteParser(this.#handler, parsedExtensions);
      parser.on("drain", () => this.#handler.onParserDrain());
      parser.on("error", (err) => this.#handler.onParserError(err));
      this.#parser = parser;
      this.#sendQueue = new SendQueue(response.socket);
      this.#handler.readyState = states.OPEN;
      const extensions = response.headersList.get("sec-websocket-extensions");
      if (extensions !== null) {
        this.#extensions = extensions;
      }
      const protocol = response.headersList.get("sec-websocket-protocol");
      if (protocol !== null) {
        this.#protocol = protocol;
      }
      fireEvent("open", this);
      if (channels.open.hasSubscribers) {
        const headers = response.headersList.entries;
        channels.open.publish({
          address: response.socket.address(),
          protocol: this.#protocol,
          extensions: this.#extensions,
          websocket: this,
          handshakeResponse: {
            status: response.status,
            statusText: response.statusText,
            headers
          }
        });
      }
    }
    #onMessage(type, data) {
      if (this.#handler.readyState !== states.OPEN) {
        return;
      }
      let dataForEvent;
      if (type === opcodes.TEXT) {
        try {
          dataForEvent = utf8Decode(data);
        } catch {
          failWebsocketConnection(this.#handler, 1007, "Received invalid UTF-8 in text frame.");
          return;
        }
      } else if (type === opcodes.BINARY) {
        if (this.#binaryType === "blob") {
          dataForEvent = new Blob([data]);
        } else {
          dataForEvent = toArrayBuffer(data);
        }
      }
      fireEvent("message", this, createFastMessageEvent, {
        origin: this.#url.origin,
        data: dataForEvent
      });
    }
    #onParserDrain() {
      this.#handler.socket.resume();
    }
    /**
     * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
     * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4
     */
    #onSocketClose() {
      const wasClean = this.#handler.closeState.has(sentCloseFrameState.SENT) && this.#handler.closeState.has(sentCloseFrameState.RECEIVED);
      let code = 1005;
      let reason = "";
      const result = this.#parser?.closingInfo;
      if (result && !result.error) {
        code = result.code ?? 1005;
        reason = result.reason;
      }
      this.#handler.readyState = states.CLOSED;
      if (!this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
        code = 1006;
        fireEvent("error", this, (type, init) => new ErrorEvent(type, init), {
          error: new TypeError(reason)
        });
      }
      fireEvent("close", this, (type, init) => new CloseEvent(type, init), {
        wasClean,
        code,
        reason
      });
      if (channels.close.hasSubscribers) {
        channels.close.publish({
          websocket: this,
          code,
          reason
        });
      }
    }
    /**
     * @param {WebSocket} ws
     * @param {Buffer|undefined} buffer
     */
    static ping(ws, buffer) {
      if (Buffer.isBuffer(buffer)) {
        if (buffer.length > 125) {
          throw new TypeError("A PING frame cannot have a body larger than 125 bytes.");
        }
      } else if (buffer !== void 0) {
        throw new TypeError("Expected buffer payload");
      }
      const readyState = ws.#handler.readyState;
      if (isEstablished(readyState) && !isClosing(readyState) && !isClosed(readyState)) {
        const frame = new WebsocketFrameSend(buffer);
        ws.#handler.socket.write(frame.createFrame(opcodes.PING));
      }
    }
  }
  const { ping } = WebSocket;
  Reflect.deleteProperty(WebSocket, "ping");
  WebSocket.CONNECTING = WebSocket.prototype.CONNECTING = states.CONNECTING;
  WebSocket.OPEN = WebSocket.prototype.OPEN = states.OPEN;
  WebSocket.CLOSING = WebSocket.prototype.CLOSING = states.CLOSING;
  WebSocket.CLOSED = WebSocket.prototype.CLOSED = states.CLOSED;
  Object.defineProperties(WebSocket.prototype, {
    CONNECTING: staticPropertyDescriptors,
    OPEN: staticPropertyDescriptors,
    CLOSING: staticPropertyDescriptors,
    CLOSED: staticPropertyDescriptors,
    url: kEnumerableProperty,
    readyState: kEnumerableProperty,
    bufferedAmount: kEnumerableProperty,
    onopen: kEnumerableProperty,
    onerror: kEnumerableProperty,
    onclose: kEnumerableProperty,
    close: kEnumerableProperty,
    onmessage: kEnumerableProperty,
    binaryType: kEnumerableProperty,
    send: kEnumerableProperty,
    extensions: kEnumerableProperty,
    protocol: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "WebSocket",
      writable: false,
      enumerable: false,
      configurable: true
    }
  });
  Object.defineProperties(WebSocket, {
    CONNECTING: staticPropertyDescriptors,
    OPEN: staticPropertyDescriptors,
    CLOSING: staticPropertyDescriptors,
    CLOSED: staticPropertyDescriptors
  });
  webidl.converters["sequence<DOMString>"] = webidl.sequenceConverter(
    webidl.converters.DOMString
  );
  webidl.converters["DOMString or sequence<DOMString>"] = function(V, prefix, argument) {
    if (webidl.util.Type(V) === webidl.util.Types.OBJECT && Symbol.iterator in V) {
      return webidl.converters["sequence<DOMString>"](V);
    }
    return webidl.converters.DOMString(V, prefix, argument);
  };
  webidl.converters.WebSocketInit = webidl.dictionaryConverter([
    {
      key: "protocols",
      converter: webidl.converters["DOMString or sequence<DOMString>"],
      defaultValue: () => []
    },
    {
      key: "dispatcher",
      converter: webidl.converters.any,
      defaultValue: () => getGlobalDispatcher()
    },
    {
      key: "headers",
      converter: webidl.nullableConverter(webidl.converters.HeadersInit)
    }
  ]);
  webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"] = function(V) {
    if (webidl.util.Type(V) === webidl.util.Types.OBJECT && !(Symbol.iterator in V)) {
      return webidl.converters.WebSocketInit(V);
    }
    return { protocols: webidl.converters["DOMString or sequence<DOMString>"](V) };
  };
  webidl.converters.WebSocketSendData = function(V) {
    if (webidl.util.Type(V) === webidl.util.Types.OBJECT) {
      if (webidl.is.Blob(V)) {
        return V;
      }
      if (webidl.is.BufferSource(V)) {
        return V;
      }
    }
    return webidl.converters.USVString(V);
  };
  websocket = {
    WebSocket,
    ping
  };
  return websocket;
}
export {
  requireWebsocket as __require
};
//# sourceMappingURL=index57.js.map
