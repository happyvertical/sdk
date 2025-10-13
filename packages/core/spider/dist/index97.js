var constants;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants;
  hasRequiredConstants = 1;
  const uid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  const staticPropertyDescriptors = {
    enumerable: true,
    writable: false,
    configurable: false
  };
  const states = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  };
  const sentCloseFrameState = {
    SENT: 1,
    RECEIVED: 2
  };
  const opcodes = {
    CONTINUATION: 0,
    TEXT: 1,
    BINARY: 2,
    CLOSE: 8,
    PING: 9,
    PONG: 10
  };
  const maxUnsigned16Bit = 65535;
  const parserStates = {
    INFO: 0,
    PAYLOADLENGTH_16: 2,
    PAYLOADLENGTH_64: 3,
    READ_DATA: 4
  };
  const emptyBuffer = Buffer.allocUnsafe(0);
  const sendHints = {
    text: 1,
    typedArray: 2,
    arrayBuffer: 3,
    blob: 4
  };
  constants = {
    uid,
    sentCloseFrameState,
    staticPropertyDescriptors,
    states,
    opcodes,
    maxUnsigned16Bit,
    parserStates,
    emptyBuffer,
    sendHints
  };
  return constants;
}
export {
  requireConstants as __require
};
//# sourceMappingURL=index97.js.map
