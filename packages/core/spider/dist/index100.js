import require$$0 from "node:stream";
import require$$0$1 from "node:assert";
import { __require as requireConstants } from "./index97.js";
import { __require as requireUtil } from "./index98.js";
import { __require as requireConnection } from "./index99.js";
import { __require as requireFrame } from "./index102.js";
import { __require as requirePermessageDeflate } from "./index116.js";
var receiver;
var hasRequiredReceiver;
function requireReceiver() {
  if (hasRequiredReceiver) return receiver;
  hasRequiredReceiver = 1;
  const { Writable } = require$$0;
  const assert = require$$0$1;
  const { parserStates, opcodes, states, emptyBuffer, sentCloseFrameState } = requireConstants();
  const {
    isValidStatusCode,
    isValidOpcode,
    websocketMessageReceived,
    utf8Decode,
    isControlFrame,
    isTextBinaryFrame,
    isContinuationFrame
  } = requireUtil();
  const { failWebsocketConnection } = requireConnection();
  const { WebsocketFrameSend } = requireFrame();
  const { PerMessageDeflate } = requirePermessageDeflate();
  class ByteParser extends Writable {
    #buffers = [];
    #fragmentsBytes = 0;
    #byteOffset = 0;
    #loop = false;
    #state = parserStates.INFO;
    #info = {};
    #fragments = [];
    /** @type {Map<string, PerMessageDeflate>} */
    #extensions;
    /** @type {import('./websocket').Handler} */
    #handler;
    constructor(handler, extensions) {
      super();
      this.#handler = handler;
      this.#extensions = extensions == null ? /* @__PURE__ */ new Map() : extensions;
      if (this.#extensions.has("permessage-deflate")) {
        this.#extensions.set("permessage-deflate", new PerMessageDeflate(extensions));
      }
    }
    /**
     * @param {Buffer} chunk
     * @param {() => void} callback
     */
    _write(chunk, _, callback) {
      this.#buffers.push(chunk);
      this.#byteOffset += chunk.length;
      this.#loop = true;
      this.run(callback);
    }
    /**
     * Runs whenever a new chunk is received.
     * Callback is called whenever there are no more chunks buffering,
     * or not enough bytes are buffered to parse.
     */
    run(callback) {
      while (this.#loop) {
        if (this.#state === parserStates.INFO) {
          if (this.#byteOffset < 2) {
            return callback();
          }
          const buffer = this.consume(2);
          const fin = (buffer[0] & 128) !== 0;
          const opcode = buffer[0] & 15;
          const masked = (buffer[1] & 128) === 128;
          const fragmented = !fin && opcode !== opcodes.CONTINUATION;
          const payloadLength = buffer[1] & 127;
          const rsv1 = buffer[0] & 64;
          const rsv2 = buffer[0] & 32;
          const rsv3 = buffer[0] & 16;
          if (!isValidOpcode(opcode)) {
            failWebsocketConnection(this.#handler, 1002, "Invalid opcode received");
            return callback();
          }
          if (masked) {
            failWebsocketConnection(this.#handler, 1002, "Frame cannot be masked");
            return callback();
          }
          if (rsv1 !== 0 && !this.#extensions.has("permessage-deflate")) {
            failWebsocketConnection(this.#handler, 1002, "Expected RSV1 to be clear.");
            return;
          }
          if (rsv2 !== 0 || rsv3 !== 0) {
            failWebsocketConnection(this.#handler, 1002, "RSV1, RSV2, RSV3 must be clear");
            return;
          }
          if (fragmented && !isTextBinaryFrame(opcode)) {
            failWebsocketConnection(this.#handler, 1002, "Invalid frame type was fragmented.");
            return;
          }
          if (isTextBinaryFrame(opcode) && this.#fragments.length > 0) {
            failWebsocketConnection(this.#handler, 1002, "Expected continuation frame");
            return;
          }
          if (this.#info.fragmented && fragmented) {
            failWebsocketConnection(this.#handler, 1002, "Fragmented frame exceeded 125 bytes.");
            return;
          }
          if ((payloadLength > 125 || fragmented) && isControlFrame(opcode)) {
            failWebsocketConnection(this.#handler, 1002, "Control frame either too large or fragmented");
            return;
          }
          if (isContinuationFrame(opcode) && this.#fragments.length === 0 && !this.#info.compressed) {
            failWebsocketConnection(this.#handler, 1002, "Unexpected continuation frame");
            return;
          }
          if (payloadLength <= 125) {
            this.#info.payloadLength = payloadLength;
            this.#state = parserStates.READ_DATA;
          } else if (payloadLength === 126) {
            this.#state = parserStates.PAYLOADLENGTH_16;
          } else if (payloadLength === 127) {
            this.#state = parserStates.PAYLOADLENGTH_64;
          }
          if (isTextBinaryFrame(opcode)) {
            this.#info.binaryType = opcode;
            this.#info.compressed = rsv1 !== 0;
          }
          this.#info.opcode = opcode;
          this.#info.masked = masked;
          this.#info.fin = fin;
          this.#info.fragmented = fragmented;
        } else if (this.#state === parserStates.PAYLOADLENGTH_16) {
          if (this.#byteOffset < 2) {
            return callback();
          }
          const buffer = this.consume(2);
          this.#info.payloadLength = buffer.readUInt16BE(0);
          this.#state = parserStates.READ_DATA;
        } else if (this.#state === parserStates.PAYLOADLENGTH_64) {
          if (this.#byteOffset < 8) {
            return callback();
          }
          const buffer = this.consume(8);
          const upper = buffer.readUInt32BE(0);
          if (upper > 2 ** 31 - 1) {
            failWebsocketConnection(this.#handler, 1009, "Received payload length > 2^31 bytes.");
            return;
          }
          const lower = buffer.readUInt32BE(4);
          this.#info.payloadLength = (upper << 8) + lower;
          this.#state = parserStates.READ_DATA;
        } else if (this.#state === parserStates.READ_DATA) {
          if (this.#byteOffset < this.#info.payloadLength) {
            return callback();
          }
          const body = this.consume(this.#info.payloadLength);
          if (isControlFrame(this.#info.opcode)) {
            this.#loop = this.parseControlFrame(body);
            this.#state = parserStates.INFO;
          } else {
            if (!this.#info.compressed) {
              this.writeFragments(body);
              if (!this.#info.fragmented && this.#info.fin) {
                websocketMessageReceived(this.#handler, this.#info.binaryType, this.consumeFragments());
              }
              this.#state = parserStates.INFO;
            } else {
              this.#extensions.get("permessage-deflate").decompress(body, this.#info.fin, (error, data) => {
                if (error) {
                  failWebsocketConnection(this.#handler, 1007, error.message);
                  return;
                }
                this.writeFragments(data);
                if (!this.#info.fin) {
                  this.#state = parserStates.INFO;
                  this.#loop = true;
                  this.run(callback);
                  return;
                }
                websocketMessageReceived(this.#handler, this.#info.binaryType, this.consumeFragments());
                this.#loop = true;
                this.#state = parserStates.INFO;
                this.run(callback);
              });
              this.#loop = false;
              break;
            }
          }
        }
      }
    }
    /**
     * Take n bytes from the buffered Buffers
     * @param {number} n
     * @returns {Buffer}
     */
    consume(n) {
      if (n > this.#byteOffset) {
        throw new Error("Called consume() before buffers satiated.");
      } else if (n === 0) {
        return emptyBuffer;
      }
      this.#byteOffset -= n;
      const first = this.#buffers[0];
      if (first.length > n) {
        this.#buffers[0] = first.subarray(n, first.length);
        return first.subarray(0, n);
      } else if (first.length === n) {
        return this.#buffers.shift();
      } else {
        let offset = 0;
        const buffer = Buffer.allocUnsafeSlow(n);
        while (offset !== n) {
          const next = this.#buffers[0];
          const length = next.length;
          if (length + offset === n) {
            buffer.set(this.#buffers.shift(), offset);
            break;
          } else if (length + offset > n) {
            buffer.set(next.subarray(0, n - offset), offset);
            this.#buffers[0] = next.subarray(n - offset);
            break;
          } else {
            buffer.set(this.#buffers.shift(), offset);
            offset += length;
          }
        }
        return buffer;
      }
    }
    writeFragments(fragment) {
      this.#fragmentsBytes += fragment.length;
      this.#fragments.push(fragment);
    }
    consumeFragments() {
      const fragments = this.#fragments;
      if (fragments.length === 1) {
        this.#fragmentsBytes = 0;
        return fragments.shift();
      }
      let offset = 0;
      const output = Buffer.allocUnsafeSlow(this.#fragmentsBytes);
      for (let i = 0; i < fragments.length; ++i) {
        const buffer = fragments[i];
        output.set(buffer, offset);
        offset += buffer.length;
      }
      this.#fragments = [];
      this.#fragmentsBytes = 0;
      return output;
    }
    parseCloseBody(data) {
      assert(data.length !== 1);
      let code;
      if (data.length >= 2) {
        code = data.readUInt16BE(0);
      }
      if (code !== void 0 && !isValidStatusCode(code)) {
        return { code: 1002, reason: "Invalid status code", error: true };
      }
      let reason = data.subarray(2);
      if (reason[0] === 239 && reason[1] === 187 && reason[2] === 191) {
        reason = reason.subarray(3);
      }
      try {
        reason = utf8Decode(reason);
      } catch {
        return { code: 1007, reason: "Invalid UTF-8", error: true };
      }
      return { code, reason, error: false };
    }
    /**
     * Parses control frames.
     * @param {Buffer} body
     */
    parseControlFrame(body) {
      const { opcode, payloadLength } = this.#info;
      if (opcode === opcodes.CLOSE) {
        if (payloadLength === 1) {
          failWebsocketConnection(this.#handler, 1002, "Received close frame with a 1-byte body.");
          return false;
        }
        this.#info.closeInfo = this.parseCloseBody(body);
        if (this.#info.closeInfo.error) {
          const { code, reason } = this.#info.closeInfo;
          failWebsocketConnection(this.#handler, code, reason);
          return false;
        }
        if (!this.#handler.closeState.has(sentCloseFrameState.SENT) && !this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
          let body2 = emptyBuffer;
          if (this.#info.closeInfo.code) {
            body2 = Buffer.allocUnsafe(2);
            body2.writeUInt16BE(this.#info.closeInfo.code, 0);
          }
          const closeFrame = new WebsocketFrameSend(body2);
          this.#handler.socket.write(closeFrame.createFrame(opcodes.CLOSE));
          this.#handler.closeState.add(sentCloseFrameState.SENT);
        }
        this.#handler.readyState = states.CLOSING;
        this.#handler.closeState.add(sentCloseFrameState.RECEIVED);
        return false;
      } else if (opcode === opcodes.PING) {
        if (!this.#handler.closeState.has(sentCloseFrameState.RECEIVED)) {
          const frame = new WebsocketFrameSend(body);
          this.#handler.socket.write(frame.createFrame(opcodes.PONG));
          this.#handler.onPing(body);
        }
      } else if (opcode === opcodes.PONG) {
        this.#handler.onPong(body);
      }
      return true;
    }
    get closingInfo() {
      return this.#info.closeInfo;
    }
  }
  receiver = {
    ByteParser
  };
  return receiver;
}
export {
  requireReceiver as __require
};
//# sourceMappingURL=index100.js.map
