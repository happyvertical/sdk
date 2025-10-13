import { __require as requireConstants } from "./index97.js";
import { __require as requireUtil } from "./index98.js";
import { __require as requireRequest } from "./index49.js";
import { __require as requireFetch } from "./index46.js";
import { __require as requireHeaders } from "./index47.js";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireFrame } from "./index102.js";
import require$$0 from "node:assert";
var connection;
var hasRequiredConnection;
function requireConnection() {
  if (hasRequiredConnection) return connection;
  hasRequiredConnection = 1;
  const { uid, states, sentCloseFrameState, emptyBuffer, opcodes } = requireConstants();
  const { parseExtensions, isClosed, isClosing, isEstablished, validateCloseCodeAndReason } = requireUtil();
  const { makeRequest } = requireRequest();
  const { fetching } = requireFetch();
  const { Headers, getHeadersList } = requireHeaders();
  const { getDecodeSplit } = requireUtil$1();
  const { WebsocketFrameSend } = requireFrame();
  const assert = require$$0;
  let crypto;
  try {
    crypto = require("node:crypto");
  } catch {
  }
  function establishWebSocketConnection(url, protocols, client, handler, options) {
    const requestURL = url;
    requestURL.protocol = url.protocol === "ws:" ? "http:" : "https:";
    const request = makeRequest({
      urlList: [requestURL],
      client,
      serviceWorkers: "none",
      referrer: "no-referrer",
      mode: "websocket",
      credentials: "include",
      cache: "no-store",
      redirect: "error"
    });
    if (options.headers) {
      const headersList = getHeadersList(new Headers(options.headers));
      request.headersList = headersList;
    }
    const keyValue = crypto.randomBytes(16).toString("base64");
    request.headersList.append("sec-websocket-key", keyValue, true);
    request.headersList.append("sec-websocket-version", "13", true);
    for (const protocol of protocols) {
      request.headersList.append("sec-websocket-protocol", protocol, true);
    }
    const permessageDeflate = "permessage-deflate; client_max_window_bits";
    request.headersList.append("sec-websocket-extensions", permessageDeflate, true);
    const controller = fetching({
      request,
      useParallelQueue: true,
      dispatcher: options.dispatcher,
      processResponse(response) {
        if (response.type === "error") {
          handler.readyState = states.CLOSED;
        }
        if (response.type === "error" || response.status !== 101) {
          failWebsocketConnection(handler, 1002, "Received network error or non-101 status code.", response.error);
          return;
        }
        if (protocols.length !== 0 && !response.headersList.get("Sec-WebSocket-Protocol")) {
          failWebsocketConnection(handler, 1002, "Server did not respond with sent protocols.");
          return;
        }
        if (response.headersList.get("Upgrade")?.toLowerCase() !== "websocket") {
          failWebsocketConnection(handler, 1002, 'Server did not set Upgrade header to "websocket".');
          return;
        }
        if (response.headersList.get("Connection")?.toLowerCase() !== "upgrade") {
          failWebsocketConnection(handler, 1002, 'Server did not set Connection header to "upgrade".');
          return;
        }
        const secWSAccept = response.headersList.get("Sec-WebSocket-Accept");
        const digest = crypto.createHash("sha1").update(keyValue + uid).digest("base64");
        if (secWSAccept !== digest) {
          failWebsocketConnection(handler, 1002, "Incorrect hash received in Sec-WebSocket-Accept header.");
          return;
        }
        const secExtension = response.headersList.get("Sec-WebSocket-Extensions");
        let extensions;
        if (secExtension !== null) {
          extensions = parseExtensions(secExtension);
          if (!extensions.has("permessage-deflate")) {
            failWebsocketConnection(handler, 1002, "Sec-WebSocket-Extensions header does not match.");
            return;
          }
        }
        const secProtocol = response.headersList.get("Sec-WebSocket-Protocol");
        if (secProtocol !== null) {
          const requestProtocols = getDecodeSplit("sec-websocket-protocol", request.headersList);
          if (!requestProtocols.includes(secProtocol)) {
            failWebsocketConnection(handler, 1002, "Protocol was not set in the opening handshake.");
            return;
          }
        }
        response.socket.on("data", handler.onSocketData);
        response.socket.on("close", handler.onSocketClose);
        response.socket.on("error", handler.onSocketError);
        handler.wasEverConnected = true;
        handler.onConnectionEstablished(response, extensions);
      }
    });
    return controller;
  }
  function closeWebSocketConnection(object, code, reason, validate = false) {
    code ??= null;
    reason ??= "";
    if (validate) validateCloseCodeAndReason(code, reason);
    if (isClosed(object.readyState) || isClosing(object.readyState)) ;
    else if (!isEstablished(object.readyState)) {
      failWebsocketConnection(object);
      object.readyState = states.CLOSING;
    } else if (!object.closeState.has(sentCloseFrameState.SENT) && !object.closeState.has(sentCloseFrameState.RECEIVED)) {
      const frame = new WebsocketFrameSend();
      if (reason.length !== 0 && code === null) {
        code = 1e3;
      }
      assert(code === null || Number.isInteger(code));
      if (code === null && reason.length === 0) {
        frame.frameData = emptyBuffer;
      } else if (code !== null && reason === null) {
        frame.frameData = Buffer.allocUnsafe(2);
        frame.frameData.writeUInt16BE(code, 0);
      } else if (code !== null && reason !== null) {
        frame.frameData = Buffer.allocUnsafe(2 + Buffer.byteLength(reason));
        frame.frameData.writeUInt16BE(code, 0);
        frame.frameData.write(reason, 2, "utf-8");
      } else {
        frame.frameData = emptyBuffer;
      }
      object.socket.write(frame.createFrame(opcodes.CLOSE));
      object.closeState.add(sentCloseFrameState.SENT);
      object.readyState = states.CLOSING;
    } else {
      object.readyState = states.CLOSING;
    }
  }
  function failWebsocketConnection(handler, code, reason, cause) {
    if (isEstablished(handler.readyState)) {
      closeWebSocketConnection(handler, code, reason, false);
    }
    handler.controller.abort();
    if (!handler.socket) {
      handler.onSocketClose();
    } else if (handler.socket.destroyed === false) {
      handler.socket.destroy();
    }
  }
  connection = {
    establishWebSocketConnection,
    failWebsocketConnection,
    closeWebSocketConnection
  };
  return connection;
}
export {
  requireConnection as __require
};
//# sourceMappingURL=index99.js.map
