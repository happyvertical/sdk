import { __require as requireConstants } from "./index97.js";
import require$$0 from "node:buffer";
import { __require as requireDataUrl } from "./index55.js";
var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  const { states, opcodes } = requireConstants();
  const { isUtf8 } = require$$0;
  const { collectASequenceOfCodePointsFast, removeHTTPWhitespace } = requireDataUrl();
  function isConnecting(readyState) {
    return readyState === states.CONNECTING;
  }
  function isEstablished(readyState) {
    return readyState === states.OPEN;
  }
  function isClosing(readyState) {
    return readyState === states.CLOSING;
  }
  function isClosed(readyState) {
    return readyState === states.CLOSED;
  }
  function fireEvent(e, target, eventFactory = (type, init) => new Event(type, init), eventInitDict = {}) {
    const event = eventFactory(e, eventInitDict);
    target.dispatchEvent(event);
  }
  function websocketMessageReceived(handler, type, data) {
    handler.onMessage(type, data);
  }
  function toArrayBuffer(buffer) {
    if (buffer.byteLength === buffer.buffer.byteLength) {
      return buffer.buffer;
    }
    return new Uint8Array(buffer).buffer;
  }
  function isValidSubprotocol(protocol) {
    if (protocol.length === 0) {
      return false;
    }
    for (let i = 0; i < protocol.length; ++i) {
      const code = protocol.charCodeAt(i);
      if (code < 33 || // CTL, contains SP (0x20) and HT (0x09)
      code > 126 || code === 34 || // "
      code === 40 || // (
      code === 41 || // )
      code === 44 || // ,
      code === 47 || // /
      code === 58 || // :
      code === 59 || // ;
      code === 60 || // <
      code === 61 || // =
      code === 62 || // >
      code === 63 || // ?
      code === 64 || // @
      code === 91 || // [
      code === 92 || // \
      code === 93 || // ]
      code === 123 || // {
      code === 125) {
        return false;
      }
    }
    return true;
  }
  function isValidStatusCode(code) {
    if (code >= 1e3 && code < 1015) {
      return code !== 1004 && // reserved
      code !== 1005 && // "MUST NOT be set as a status code"
      code !== 1006;
    }
    return code >= 3e3 && code <= 4999;
  }
  function isControlFrame(opcode) {
    return opcode === opcodes.CLOSE || opcode === opcodes.PING || opcode === opcodes.PONG;
  }
  function isContinuationFrame(opcode) {
    return opcode === opcodes.CONTINUATION;
  }
  function isTextBinaryFrame(opcode) {
    return opcode === opcodes.TEXT || opcode === opcodes.BINARY;
  }
  function isValidOpcode(opcode) {
    return isTextBinaryFrame(opcode) || isContinuationFrame(opcode) || isControlFrame(opcode);
  }
  function parseExtensions(extensions) {
    const position = { position: 0 };
    const extensionList = /* @__PURE__ */ new Map();
    while (position.position < extensions.length) {
      const pair = collectASequenceOfCodePointsFast(";", extensions, position);
      const [name, value = ""] = pair.split("=", 2);
      extensionList.set(
        removeHTTPWhitespace(name, true, false),
        removeHTTPWhitespace(value, false, true)
      );
      position.position++;
    }
    return extensionList;
  }
  function isValidClientWindowBits(value) {
    for (let i = 0; i < value.length; i++) {
      const byte = value.charCodeAt(i);
      if (byte < 48 || byte > 57) {
        return false;
      }
    }
    return true;
  }
  function getURLRecord(url, baseURL) {
    let urlRecord;
    try {
      urlRecord = new URL(url, baseURL);
    } catch (e) {
      throw new DOMException(e, "SyntaxError");
    }
    if (urlRecord.protocol === "http:") {
      urlRecord.protocol = "ws:";
    } else if (urlRecord.protocol === "https:") {
      urlRecord.protocol = "wss:";
    }
    if (urlRecord.protocol !== "ws:" && urlRecord.protocol !== "wss:") {
      throw new DOMException("expected a ws: or wss: url", "SyntaxError");
    }
    if (urlRecord.hash.length || urlRecord.href.endsWith("#")) {
      throw new DOMException("hash", "SyntaxError");
    }
    return urlRecord;
  }
  function validateCloseCodeAndReason(code, reason) {
    if (code !== null) {
      if (code !== 1e3 && (code < 3e3 || code > 4999)) {
        throw new DOMException("invalid code", "InvalidAccessError");
      }
    }
    if (reason !== null) {
      const reasonBytesLength = Buffer.byteLength(reason);
      if (reasonBytesLength > 123) {
        throw new DOMException(`Reason must be less than 123 bytes; received ${reasonBytesLength}`, "SyntaxError");
      }
    }
  }
  const utf8Decode = (() => {
    if (typeof process.versions.icu === "string") {
      const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
      return fatalDecoder.decode.bind(fatalDecoder);
    }
    return function(buffer) {
      if (isUtf8(buffer)) {
        return buffer.toString("utf-8");
      }
      throw new TypeError("Invalid utf-8 received.");
    };
  })();
  util = {
    isConnecting,
    isEstablished,
    isClosing,
    isClosed,
    fireEvent,
    isValidSubprotocol,
    isValidStatusCode,
    websocketMessageReceived,
    utf8Decode,
    isControlFrame,
    isContinuationFrame,
    isTextBinaryFrame,
    isValidOpcode,
    parseExtensions,
    isValidClientWindowBits,
    toArrayBuffer,
    getURLRecord,
    validateCloseCodeAndReason
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index98.js.map
