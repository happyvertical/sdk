import { __require as requirePromise } from "./index93.js";
import { __require as requireUtil } from "./index88.js";
import { __require as requireConstants } from "./index97.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireUtil$1 } from "./index98.js";
import { __require as requireConnection } from "./index99.js";
import { __require as requireDiagnostics } from "./index62.js";
import { __require as requireFrame } from "./index102.js";
import { __require as requireReceiver } from "./index100.js";
import { __require as requireWebsocketerror } from "./index59.js";
import { __require as requireUtil$2 } from "./index24.js";
var websocketstream;
var hasRequiredWebsocketstream;
function requireWebsocketstream() {
  if (hasRequiredWebsocketstream) return websocketstream;
  hasRequiredWebsocketstream = 1;
  const { createDeferredPromise } = requirePromise();
  const { environmentSettingsObject } = requireUtil();
  const { states, opcodes, sentCloseFrameState } = requireConstants();
  const { webidl } = requireWebidl();
  const { getURLRecord, isValidSubprotocol, isEstablished, utf8Decode } = requireUtil$1();
  const { establishWebSocketConnection, failWebsocketConnection, closeWebSocketConnection } = requireConnection();
  const { channels } = requireDiagnostics();
  const { WebsocketFrameSend } = requireFrame();
  const { ByteParser } = requireReceiver();
  const { WebSocketError, createUnvalidatedWebSocketError } = requireWebsocketerror();
  const { utf8DecodeBytes } = requireUtil();
  const { kEnumerableProperty } = requireUtil$2();
  let emittedExperimentalWarning = false;
  class WebSocketStream {
    // Each WebSocketStream object has an associated url , which is a URL record .
    /** @type {URL} */
    #url;
    // Each WebSocketStream object has an associated opened promise , which is a promise.
    /** @type {import('../../../util/promise').DeferredPromise} */
    #openedPromise;
    // Each WebSocketStream object has an associated closed promise , which is a promise.
    /** @type {import('../../../util/promise').DeferredPromise} */
    #closedPromise;
    // Each WebSocketStream object has an associated readable stream , which is a ReadableStream .
    /** @type {ReadableStream} */
    #readableStream;
    /** @type {ReadableStreamDefaultController} */
    #readableStreamController;
    // Each WebSocketStream object has an associated writable stream , which is a WritableStream .
    /** @type {WritableStream} */
    #writableStream;
    // Each WebSocketStream object has an associated boolean handshake aborted , which is initially false.
    #handshakeAborted = false;
    /** @type {import('../websocket').Handler} */
    #handler = {
      // https://whatpr.org/websockets/48/7b748d3...d5570f3.html#feedback-to-websocket-stream-from-the-protocol
      onConnectionEstablished: (response, extensions) => this.#onConnectionEstablished(response, extensions),
      onMessage: (opcode, data) => this.#onMessage(opcode, data),
      onParserError: (err) => failWebsocketConnection(this.#handler, null, err.message),
      onParserDrain: () => this.#handler.socket.resume(),
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
      onPing: () => {
      },
      onPong: () => {
      },
      readyState: states.CONNECTING,
      socket: null,
      closeState: /* @__PURE__ */ new Set(),
      controller: null,
      wasEverConnected: false
    };
    /** @type {import('../receiver').ByteParser} */
    #parser;
    constructor(url, options = void 0) {
      if (!emittedExperimentalWarning) {
        process.emitWarning("WebSocketStream is experimental! Expect it to change at any time.", {
          code: "UNDICI-WSS"
        });
        emittedExperimentalWarning = true;
      }
      webidl.argumentLengthCheck(arguments, 1, "WebSocket");
      url = webidl.converters.USVString(url);
      if (options !== null) {
        options = webidl.converters.WebSocketStreamOptions(options);
      }
      const baseURL = environmentSettingsObject.settingsObject.baseUrl;
      const urlRecord = getURLRecord(url, baseURL);
      const protocols = options.protocols;
      if (protocols.length !== new Set(protocols.map((p) => p.toLowerCase())).size) {
        throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
      }
      if (protocols.length > 0 && !protocols.every((p) => isValidSubprotocol(p))) {
        throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
      }
      this.#url = urlRecord.toString();
      this.#openedPromise = createDeferredPromise();
      this.#closedPromise = createDeferredPromise();
      if (options.signal != null) {
        const signal = options.signal;
        if (signal.aborted) {
          this.#openedPromise.reject(signal.reason);
          this.#closedPromise.reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => {
          if (!isEstablished(this.#handler.readyState)) {
            failWebsocketConnection(this.#handler);
            this.#handler.readyState = states.CLOSING;
            this.#openedPromise.reject(signal.reason);
            this.#closedPromise.reject(signal.reason);
            this.#handshakeAborted = true;
          }
        }, { once: true });
      }
      const client = environmentSettingsObject.settingsObject;
      this.#handler.controller = establishWebSocketConnection(
        urlRecord,
        protocols,
        client,
        this.#handler,
        options
      );
    }
    // The url getter steps are to return this 's url , serialized .
    get url() {
      return this.#url.toString();
    }
    // The opened getter steps are to return this 's opened promise .
    get opened() {
      return this.#openedPromise.promise;
    }
    // The closed getter steps are to return this 's closed promise .
    get closed() {
      return this.#closedPromise.promise;
    }
    // The close( closeInfo ) method steps are:
    close(closeInfo = void 0) {
      if (closeInfo !== null) {
        closeInfo = webidl.converters.WebSocketCloseInfo(closeInfo);
      }
      const code = closeInfo.closeCode ?? null;
      const reason = closeInfo.reason;
      closeWebSocketConnection(this.#handler, code, reason, true);
    }
    #write(chunk) {
      chunk = webidl.converters.WebSocketStreamWrite(chunk);
      const promise = createDeferredPromise();
      let data = null;
      let opcode = null;
      if (webidl.is.BufferSource(chunk)) {
        data = new Uint8Array(ArrayBuffer.isView(chunk) ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) : chunk.slice());
        opcode = opcodes.BINARY;
      } else {
        let string;
        try {
          string = webidl.converters.DOMString(chunk);
        } catch (e) {
          promise.reject(e);
          return promise.promise;
        }
        data = new TextEncoder().encode(string);
        opcode = opcodes.TEXT;
      }
      if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
        const frame = new WebsocketFrameSend(data);
        this.#handler.socket.write(frame.createFrame(opcode), () => {
          promise.resolve(void 0);
        });
      }
      return promise.promise;
    }
    /** @type {import('../websocket').Handler['onConnectionEstablished']} */
    #onConnectionEstablished(response, parsedExtensions) {
      this.#handler.socket = response.socket;
      const parser = new ByteParser(this.#handler, parsedExtensions);
      parser.on("drain", () => this.#handler.onParserDrain());
      parser.on("error", (err) => this.#handler.onParserError(err));
      this.#parser = parser;
      this.#handler.readyState = states.OPEN;
      const extensions = parsedExtensions ?? "";
      const protocol = response.headersList.get("sec-websocket-protocol") ?? "";
      const readable = new ReadableStream({
        start: (controller) => {
          this.#readableStreamController = controller;
        },
        pull(controller) {
          let chunk;
          while (controller.desiredSize > 0 && (chunk = response.socket.read()) !== null) {
            controller.enqueue(chunk);
          }
        },
        cancel: (reason) => this.#cancel(reason)
      });
      const writable = new WritableStream({
        write: (chunk) => this.#write(chunk),
        close: () => closeWebSocketConnection(this.#handler, null, null),
        abort: (reason) => this.#closeUsingReason(reason)
      });
      this.#readableStream = readable;
      this.#writableStream = writable;
      this.#openedPromise.resolve({
        extensions,
        protocol,
        readable,
        writable
      });
    }
    /** @type {import('../websocket').Handler['onMessage']} */
    #onMessage(type, data) {
      if (this.#handler.readyState !== states.OPEN) {
        return;
      }
      let chunk;
      if (type === opcodes.TEXT) {
        try {
          chunk = utf8Decode(data);
        } catch {
          failWebsocketConnection(this.#handler, "Received invalid UTF-8 in text frame.");
          return;
        }
      } else if (type === opcodes.BINARY) {
        chunk = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }
      this.#readableStreamController.enqueue(chunk);
    }
    /** @type {import('../websocket').Handler['onSocketClose']} */
    #onSocketClose() {
      const wasClean = this.#handler.closeState.has(sentCloseFrameState.SENT) && this.#handler.closeState.has(sentCloseFrameState.RECEIVED);
      this.#handler.readyState = states.CLOSED;
      if (this.#handshakeAborted) {
        return;
      }
      if (!this.#handler.wasEverConnected) {
        this.#openedPromise.reject(new WebSocketError("Socket never opened"));
      }
      const result = this.#parser.closingInfo;
      let code = result?.code ?? 1005;
      if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
        code = 1006;
      }
      const reason = result?.reason == null ? "" : utf8DecodeBytes(Buffer.from(result.reason));
      if (wasClean) {
        this.#readableStreamController.close();
        if (!this.#writableStream.locked) {
          this.#writableStream.abort(new DOMException("A closed WebSocketStream cannot be written to", "InvalidStateError"));
        }
        this.#closedPromise.resolve({
          closeCode: code,
          reason
        });
      } else {
        const error = createUnvalidatedWebSocketError("unclean close", code, reason);
        this.#readableStreamController.error(error);
        this.#writableStream.abort(error);
        this.#closedPromise.reject(error);
      }
    }
    #closeUsingReason(reason) {
      let code = null;
      let reasonString = "";
      if (webidl.is.WebSocketError(reason)) {
        code = reason.closeCode;
        reasonString = reason.reason;
      }
      closeWebSocketConnection(this.#handler, code, reasonString);
    }
    //  To cancel a WebSocketStream stream given reason , close using reason giving stream and reason .
    #cancel(reason) {
      this.#closeUsingReason(reason);
    }
  }
  Object.defineProperties(WebSocketStream.prototype, {
    url: kEnumerableProperty,
    opened: kEnumerableProperty,
    closed: kEnumerableProperty,
    close: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "WebSocketStream",
      writable: false,
      enumerable: false,
      configurable: true
    }
  });
  webidl.converters.WebSocketStreamOptions = webidl.dictionaryConverter([
    {
      key: "protocols",
      converter: webidl.sequenceConverter(webidl.converters.USVString),
      defaultValue: () => []
    },
    {
      key: "signal",
      converter: webidl.nullableConverter(webidl.converters.AbortSignal),
      defaultValue: () => null
    }
  ]);
  webidl.converters.WebSocketCloseInfo = webidl.dictionaryConverter([
    {
      key: "closeCode",
      converter: (V) => webidl.converters["unsigned short"](V, webidl.attributes.EnforceRange)
    },
    {
      key: "reason",
      converter: webidl.converters.USVString,
      defaultValue: () => ""
    }
  ]);
  webidl.converters.WebSocketStreamWrite = function(V) {
    if (typeof V === "string") {
      return webidl.converters.USVString(V);
    }
    return webidl.converters.BufferSource(V);
  };
  websocketstream = { WebSocketStream };
  return websocketstream;
}
export {
  requireWebsocketstream as __require
};
//# sourceMappingURL=index58.js.map
