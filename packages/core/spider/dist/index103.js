import require$$0 from "node:stream";
import { __require as requireUtil } from "./index118.js";
var eventsourceStream;
var hasRequiredEventsourceStream;
function requireEventsourceStream() {
  if (hasRequiredEventsourceStream) return eventsourceStream;
  hasRequiredEventsourceStream = 1;
  const { Transform } = require$$0;
  const { isASCIINumber, isValidLastEventId } = requireUtil();
  const BOM = [239, 187, 191];
  const LF = 10;
  const CR = 13;
  const COLON = 58;
  const SPACE = 32;
  class EventSourceStream extends Transform {
    /**
     * @type {eventSourceSettings}
     */
    state;
    /**
     * Leading byte-order-mark check.
     * @type {boolean}
     */
    checkBOM = true;
    /**
     * @type {boolean}
     */
    crlfCheck = false;
    /**
     * @type {boolean}
     */
    eventEndCheck = false;
    /**
     * @type {Buffer|null}
     */
    buffer = null;
    pos = 0;
    event = {
      data: void 0,
      event: void 0,
      id: void 0,
      retry: void 0
    };
    /**
     * @param {object} options
     * @param {boolean} [options.readableObjectMode]
     * @param {eventSourceSettings} [options.eventSourceSettings]
     * @param {(chunk: any, encoding?: BufferEncoding | undefined) => boolean} [options.push]
     */
    constructor(options = {}) {
      options.readableObjectMode = true;
      super(options);
      this.state = options.eventSourceSettings || {};
      if (options.push) {
        this.push = options.push;
      }
    }
    /**
     * @param {Buffer} chunk
     * @param {string} _encoding
     * @param {Function} callback
     * @returns {void}
     */
    _transform(chunk, _encoding, callback) {
      if (chunk.length === 0) {
        callback();
        return;
      }
      if (this.buffer) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
      } else {
        this.buffer = chunk;
      }
      if (this.checkBOM) {
        switch (this.buffer.length) {
          case 1:
            if (this.buffer[0] === BOM[0]) {
              callback();
              return;
            }
            this.checkBOM = false;
            callback();
            return;
          case 2:
            if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1]) {
              callback();
              return;
            }
            this.checkBOM = false;
            break;
          case 3:
            if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
              this.buffer = Buffer.alloc(0);
              this.checkBOM = false;
              callback();
              return;
            }
            this.checkBOM = false;
            break;
          default:
            if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
              this.buffer = this.buffer.subarray(3);
            }
            this.checkBOM = false;
            break;
        }
      }
      while (this.pos < this.buffer.length) {
        if (this.eventEndCheck) {
          if (this.crlfCheck) {
            if (this.buffer[this.pos] === LF) {
              this.buffer = this.buffer.subarray(this.pos + 1);
              this.pos = 0;
              this.crlfCheck = false;
              continue;
            }
            this.crlfCheck = false;
          }
          if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
            if (this.buffer[this.pos] === CR) {
              this.crlfCheck = true;
            }
            this.buffer = this.buffer.subarray(this.pos + 1);
            this.pos = 0;
            if (this.event.data !== void 0 || this.event.event || this.event.id !== void 0 || this.event.retry) {
              this.processEvent(this.event);
            }
            this.clearEvent();
            continue;
          }
          this.eventEndCheck = false;
          continue;
        }
        if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
          if (this.buffer[this.pos] === CR) {
            this.crlfCheck = true;
          }
          this.parseLine(this.buffer.subarray(0, this.pos), this.event);
          this.buffer = this.buffer.subarray(this.pos + 1);
          this.pos = 0;
          this.eventEndCheck = true;
          continue;
        }
        this.pos++;
      }
      callback();
    }
    /**
     * @param {Buffer} line
     * @param {EventSourceStreamEvent} event
     */
    parseLine(line, event) {
      if (line.length === 0) {
        return;
      }
      const colonPosition = line.indexOf(COLON);
      if (colonPosition === 0) {
        return;
      }
      let field = "";
      let value = "";
      if (colonPosition !== -1) {
        field = line.subarray(0, colonPosition).toString("utf8");
        let valueStart = colonPosition + 1;
        if (line[valueStart] === SPACE) {
          ++valueStart;
        }
        value = line.subarray(valueStart).toString("utf8");
      } else {
        field = line.toString("utf8");
        value = "";
      }
      switch (field) {
        case "data":
          if (event[field] === void 0) {
            event[field] = value;
          } else {
            event[field] += `
${value}`;
          }
          break;
        case "retry":
          if (isASCIINumber(value)) {
            event[field] = value;
          }
          break;
        case "id":
          if (isValidLastEventId(value)) {
            event[field] = value;
          }
          break;
        case "event":
          if (value.length > 0) {
            event[field] = value;
          }
          break;
      }
    }
    /**
     * @param {EventSourceStreamEvent} event
     */
    processEvent(event) {
      if (event.retry && isASCIINumber(event.retry)) {
        this.state.reconnectionTime = parseInt(event.retry, 10);
      }
      if (event.id !== void 0 && isValidLastEventId(event.id)) {
        this.state.lastEventId = event.id;
      }
      if (event.data !== void 0) {
        this.push({
          type: event.event || "message",
          options: {
            data: event.data,
            lastEventId: this.state.lastEventId,
            origin: this.state.origin
          }
        });
      }
    }
    clearEvent() {
      this.event = {
        data: void 0,
        event: void 0,
        id: void 0,
        retry: void 0
      };
    }
  }
  eventsourceStream = {
    EventSourceStream
  };
  return eventsourceStream;
}
export {
  requireEventsourceStream as __require
};
//# sourceMappingURL=index103.js.map
