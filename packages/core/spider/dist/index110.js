import require$$0$1 from "node:assert";
import require$$0 from "node:stream";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
var readable;
var hasRequiredReadable;
function requireReadable() {
  if (hasRequiredReadable) return readable;
  hasRequiredReadable = 1;
  const assert = require$$0$1;
  const { Readable } = require$$0;
  const { RequestAbortedError, NotSupportedError, InvalidArgumentError, AbortError } = requireErrors();
  const util = requireUtil();
  const { ReadableStreamFrom } = requireUtil();
  const kConsume = Symbol("kConsume");
  const kReading = Symbol("kReading");
  const kBody = Symbol("kBody");
  const kAbort = Symbol("kAbort");
  const kContentType = Symbol("kContentType");
  const kContentLength = Symbol("kContentLength");
  const kUsed = Symbol("kUsed");
  const kBytesRead = Symbol("kBytesRead");
  const noop = () => {
  };
  class BodyReadable extends Readable {
    /**
     * @param {object} opts
     * @param {(this: Readable, size: number) => void} opts.resume
     * @param {() => (void | null)} opts.abort
     * @param {string} [opts.contentType = '']
     * @param {number} [opts.contentLength]
     * @param {number} [opts.highWaterMark = 64 * 1024]
     */
    constructor({
      resume,
      abort,
      contentType = "",
      contentLength,
      highWaterMark = 64 * 1024
      // Same as nodejs fs streams.
    }) {
      super({
        autoDestroy: true,
        read: resume,
        highWaterMark
      });
      this._readableState.dataEmitted = false;
      this[kAbort] = abort;
      this[kConsume] = null;
      this[kBytesRead] = 0;
      this[kBody] = null;
      this[kUsed] = false;
      this[kContentType] = contentType;
      this[kContentLength] = Number.isFinite(contentLength) ? contentLength : null;
      this[kReading] = false;
    }
    /**
     * @param {Error|null} err
     * @param {(error:(Error|null)) => void} callback
     * @returns {void}
     */
    _destroy(err, callback) {
      if (!err && !this._readableState.endEmitted) {
        err = new RequestAbortedError();
      }
      if (err) {
        this[kAbort]();
      }
      if (!this[kUsed]) {
        setImmediate(callback, err);
      } else {
        callback(err);
      }
    }
    /**
     * @param {string|symbol} event
     * @param {(...args: any[]) => void} listener
     * @returns {this}
     */
    on(event, listener) {
      if (event === "data" || event === "readable") {
        this[kReading] = true;
        this[kUsed] = true;
      }
      return super.on(event, listener);
    }
    /**
     * @param {string|symbol} event
     * @param {(...args: any[]) => void} listener
     * @returns {this}
     */
    addListener(event, listener) {
      return this.on(event, listener);
    }
    /**
     * @param {string|symbol} event
     * @param {(...args: any[]) => void} listener
     * @returns {this}
     */
    off(event, listener) {
      const ret = super.off(event, listener);
      if (event === "data" || event === "readable") {
        this[kReading] = this.listenerCount("data") > 0 || this.listenerCount("readable") > 0;
      }
      return ret;
    }
    /**
     * @param {string|symbol} event
     * @param {(...args: any[]) => void} listener
     * @returns {this}
     */
    removeListener(event, listener) {
      return this.off(event, listener);
    }
    /**
     * @param {Buffer|null} chunk
     * @returns {boolean}
     */
    push(chunk) {
      if (chunk) {
        this[kBytesRead] += chunk.length;
        if (this[kConsume]) {
          consumePush(this[kConsume], chunk);
          return this[kReading] ? super.push(chunk) : true;
        }
      }
      return super.push(chunk);
    }
    /**
     * Consumes and returns the body as a string.
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-text
     * @returns {Promise<string>}
     */
    text() {
      return consume(this, "text");
    }
    /**
     * Consumes and returns the body as a JavaScript Object.
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-json
     * @returns {Promise<unknown>}
     */
    json() {
      return consume(this, "json");
    }
    /**
     * Consumes and returns the body as a Blob
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-blob
     * @returns {Promise<Blob>}
     */
    blob() {
      return consume(this, "blob");
    }
    /**
     * Consumes and returns the body as an Uint8Array.
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-bytes
     * @returns {Promise<Uint8Array>}
     */
    bytes() {
      return consume(this, "bytes");
    }
    /**
     * Consumes and returns the body as an ArrayBuffer.
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-arraybuffer
     * @returns {Promise<ArrayBuffer>}
     */
    arrayBuffer() {
      return consume(this, "arrayBuffer");
    }
    /**
     * Not implemented
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-formdata
     * @throws {NotSupportedError}
     */
    async formData() {
      throw new NotSupportedError();
    }
    /**
     * Returns true if the body is not null and the body has been consumed.
     * Otherwise, returns false.
     *
     * @see https://fetch.spec.whatwg.org/#dom-body-bodyused
     * @readonly
     * @returns {boolean}
     */
    get bodyUsed() {
      return util.isDisturbed(this);
    }
    /**
     * @see https://fetch.spec.whatwg.org/#dom-body-body
     * @readonly
     * @returns {ReadableStream}
     */
    get body() {
      if (!this[kBody]) {
        this[kBody] = ReadableStreamFrom(this);
        if (this[kConsume]) {
          this[kBody].getReader();
          assert(this[kBody].locked);
        }
      }
      return this[kBody];
    }
    /**
     * Dumps the response body by reading `limit` number of bytes.
     * @param {object} opts
     * @param {number} [opts.limit = 131072] Number of bytes to read.
     * @param {AbortSignal} [opts.signal] An AbortSignal to cancel the dump.
     * @returns {Promise<null>}
     */
    dump(opts) {
      const signal = opts?.signal;
      if (signal != null && (typeof signal !== "object" || !("aborted" in signal))) {
        return Promise.reject(new InvalidArgumentError("signal must be an AbortSignal"));
      }
      const limit = opts?.limit && Number.isFinite(opts.limit) ? opts.limit : 128 * 1024;
      if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new AbortError());
      }
      if (this._readableState.closeEmitted) {
        return Promise.resolve(null);
      }
      return new Promise((resolve, reject) => {
        if (this[kContentLength] && this[kContentLength] > limit || this[kBytesRead] > limit) {
          this.destroy(new AbortError());
        }
        if (signal) {
          const onAbort = () => {
            this.destroy(signal.reason ?? new AbortError());
          };
          signal.addEventListener("abort", onAbort);
          this.on("close", function() {
            signal.removeEventListener("abort", onAbort);
            if (signal.aborted) {
              reject(signal.reason ?? new AbortError());
            } else {
              resolve(null);
            }
          });
        } else {
          this.on("close", resolve);
        }
        this.on("error", noop).on("data", () => {
          if (this[kBytesRead] > limit) {
            this.destroy();
          }
        }).resume();
      });
    }
    /**
     * @param {BufferEncoding} encoding
     * @returns {this}
     */
    setEncoding(encoding) {
      if (Buffer.isEncoding(encoding)) {
        this._readableState.encoding = encoding;
      }
      return this;
    }
  }
  function isLocked(bodyReadable) {
    return bodyReadable[kBody]?.locked === true || bodyReadable[kConsume] !== null;
  }
  function isUnusable(bodyReadable) {
    return util.isDisturbed(bodyReadable) || isLocked(bodyReadable);
  }
  function consume(stream, type) {
    assert(!stream[kConsume]);
    return new Promise((resolve, reject) => {
      if (isUnusable(stream)) {
        const rState = stream._readableState;
        if (rState.destroyed && rState.closeEmitted === false) {
          stream.on("error", reject).on("close", () => {
            reject(new TypeError("unusable"));
          });
        } else {
          reject(rState.errored ?? new TypeError("unusable"));
        }
      } else {
        queueMicrotask(() => {
          stream[kConsume] = {
            type,
            stream,
            resolve,
            reject,
            length: 0,
            body: []
          };
          stream.on("error", function(err) {
            consumeFinish(this[kConsume], err);
          }).on("close", function() {
            if (this[kConsume].body !== null) {
              consumeFinish(this[kConsume], new RequestAbortedError());
            }
          });
          consumeStart(stream[kConsume]);
        });
      }
    });
  }
  function consumeStart(consume2) {
    if (consume2.body === null) {
      return;
    }
    const { _readableState: state } = consume2.stream;
    if (state.bufferIndex) {
      const start = state.bufferIndex;
      const end = state.buffer.length;
      for (let n = start; n < end; n++) {
        consumePush(consume2, state.buffer[n]);
      }
    } else {
      for (const chunk of state.buffer) {
        consumePush(consume2, chunk);
      }
    }
    if (state.endEmitted) {
      consumeEnd(this[kConsume], this._readableState.encoding);
    } else {
      consume2.stream.on("end", function() {
        consumeEnd(this[kConsume], this._readableState.encoding);
      });
    }
    consume2.stream.resume();
    while (consume2.stream.read() != null) {
    }
  }
  function chunksDecode(chunks, length, encoding) {
    if (chunks.length === 0 || length === 0) {
      return "";
    }
    const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length);
    const bufferLength = buffer.length;
    const start = bufferLength > 2 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191 ? 3 : 0;
    if (!encoding || encoding === "utf8" || encoding === "utf-8") {
      return buffer.utf8Slice(start, bufferLength);
    } else {
      return buffer.subarray(start, bufferLength).toString(encoding);
    }
  }
  function chunksConcat(chunks, length) {
    if (chunks.length === 0 || length === 0) {
      return new Uint8Array(0);
    }
    if (chunks.length === 1) {
      return new Uint8Array(chunks[0]);
    }
    const buffer = new Uint8Array(Buffer.allocUnsafeSlow(length).buffer);
    let offset = 0;
    for (let i = 0; i < chunks.length; ++i) {
      const chunk = chunks[i];
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return buffer;
  }
  function consumeEnd(consume2, encoding) {
    const { type, body, resolve, stream, length } = consume2;
    try {
      if (type === "text") {
        resolve(chunksDecode(body, length, encoding));
      } else if (type === "json") {
        resolve(JSON.parse(chunksDecode(body, length, encoding)));
      } else if (type === "arrayBuffer") {
        resolve(chunksConcat(body, length).buffer);
      } else if (type === "blob") {
        resolve(new Blob(body, { type: stream[kContentType] }));
      } else if (type === "bytes") {
        resolve(chunksConcat(body, length));
      }
      consumeFinish(consume2);
    } catch (err) {
      stream.destroy(err);
    }
  }
  function consumePush(consume2, chunk) {
    consume2.length += chunk.length;
    consume2.body.push(chunk);
  }
  function consumeFinish(consume2, err) {
    if (consume2.body === null) {
      return;
    }
    if (err) {
      consume2.reject(err);
    } else {
      consume2.resolve();
    }
    consume2.type = null;
    consume2.stream = null;
    consume2.resolve = null;
    consume2.reject = null;
    consume2.length = 0;
    consume2.body = null;
  }
  readable = {
    Readable: BodyReadable,
    chunksDecode
  };
  return readable;
}
export {
  requireReadable as __require
};
//# sourceMappingURL=index110.js.map
