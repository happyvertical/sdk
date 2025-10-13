import { __require as requireConstants } from "./index97.js";
var frame;
var hasRequiredFrame;
function requireFrame() {
  if (hasRequiredFrame) return frame;
  hasRequiredFrame = 1;
  const { maxUnsigned16Bit, opcodes } = requireConstants();
  const BUFFER_SIZE = 8 * 1024;
  let crypto;
  let buffer = null;
  let bufIdx = BUFFER_SIZE;
  try {
    crypto = require("node:crypto");
  } catch {
    crypto = {
      // not full compatibility, but minimum.
      randomFillSync: function randomFillSync(buffer2, _offset, _size) {
        for (let i = 0; i < buffer2.length; ++i) {
          buffer2[i] = Math.random() * 255 | 0;
        }
        return buffer2;
      }
    };
  }
  function generateMask() {
    if (bufIdx === BUFFER_SIZE) {
      bufIdx = 0;
      crypto.randomFillSync(buffer ??= Buffer.allocUnsafeSlow(BUFFER_SIZE), 0, BUFFER_SIZE);
    }
    return [buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++]];
  }
  class WebsocketFrameSend {
    /**
     * @param {Buffer|undefined} data
     */
    constructor(data) {
      this.frameData = data;
    }
    createFrame(opcode) {
      const frameData = this.frameData;
      const maskKey = generateMask();
      const bodyLength = frameData?.byteLength ?? 0;
      let payloadLength = bodyLength;
      let offset = 6;
      if (bodyLength > maxUnsigned16Bit) {
        offset += 8;
        payloadLength = 127;
      } else if (bodyLength > 125) {
        offset += 2;
        payloadLength = 126;
      }
      const buffer2 = Buffer.allocUnsafe(bodyLength + offset);
      buffer2[0] = buffer2[1] = 0;
      buffer2[0] |= 128;
      buffer2[0] = (buffer2[0] & 240) + opcode;
      /*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
      buffer2[offset - 4] = maskKey[0];
      buffer2[offset - 3] = maskKey[1];
      buffer2[offset - 2] = maskKey[2];
      buffer2[offset - 1] = maskKey[3];
      buffer2[1] = payloadLength;
      if (payloadLength === 126) {
        buffer2.writeUInt16BE(bodyLength, 2);
      } else if (payloadLength === 127) {
        buffer2[2] = buffer2[3] = 0;
        buffer2.writeUIntBE(bodyLength, 4, 6);
      }
      buffer2[1] |= 128;
      for (let i = 0; i < bodyLength; ++i) {
        buffer2[offset + i] = frameData[i] ^ maskKey[i & 3];
      }
      return buffer2;
    }
    /**
     * @param {Uint8Array} buffer
     */
    static createFastTextFrame(buffer2) {
      const maskKey = generateMask();
      const bodyLength = buffer2.length;
      for (let i = 0; i < bodyLength; ++i) {
        buffer2[i] ^= maskKey[i & 3];
      }
      let payloadLength = bodyLength;
      let offset = 6;
      if (bodyLength > maxUnsigned16Bit) {
        offset += 8;
        payloadLength = 127;
      } else if (bodyLength > 125) {
        offset += 2;
        payloadLength = 126;
      }
      const head = Buffer.allocUnsafeSlow(offset);
      head[0] = 128 | opcodes.TEXT;
      head[1] = payloadLength | 128;
      head[offset - 4] = maskKey[0];
      head[offset - 3] = maskKey[1];
      head[offset - 2] = maskKey[2];
      head[offset - 1] = maskKey[3];
      if (payloadLength === 126) {
        head.writeUInt16BE(bodyLength, 2);
      } else if (payloadLength === 127) {
        head[2] = head[3] = 0;
        head.writeUIntBE(bodyLength, 4, 6);
      }
      return [head, buffer2];
    }
  }
  frame = {
    WebsocketFrameSend,
    generateMask
    // for benchmark
  };
  return frame;
}
export {
  requireFrame as __require
};
//# sourceMappingURL=index102.js.map
