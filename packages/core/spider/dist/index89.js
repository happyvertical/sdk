import { __require as requireUtil } from "./index24.js";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireFormdata } from "./index50.js";
import { __require as requireWebidl } from "./index91.js";
import require$$0$1 from "node:assert";
import require$$0 from "node:stream";
import require$$8 from "node:util/types";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireFormdataParser } from "./index118.js";
import { __require as requirePromise } from "./index93.js";
var body;
var hasRequiredBody;
function requireBody() {
  if (hasRequiredBody) return body;
  hasRequiredBody = 1;
  const util = requireUtil();
  const {
    ReadableStreamFrom,
    readableStreamClose,
    fullyReadBody,
    extractMimeType,
    utf8DecodeBytes
  } = requireUtil$1();
  const { FormData, setFormDataState } = requireFormdata();
  const { webidl } = requireWebidl();
  const assert = require$$0$1;
  const { isErrored, isDisturbed } = require$$0;
  const { isArrayBuffer } = require$$8;
  const { serializeAMimeType } = requireDataUrl();
  const { multipartFormDataParser } = requireFormdataParser();
  const { createDeferredPromise } = requirePromise();
  let random;
  try {
    const crypto = require("node:crypto");
    random = (max) => crypto.randomInt(0, max);
  } catch {
    random = (max) => Math.floor(Math.random() * max);
  }
  const textEncoder = new TextEncoder();
  function noop() {
  }
  const streamRegistry = new FinalizationRegistry((weakRef) => {
    const stream = weakRef.deref();
    if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
      stream.cancel("Response object has been garbage collected").catch(noop);
    }
  });
  function extractBody(object, keepalive = false) {
    let stream = null;
    if (webidl.is.ReadableStream(object)) {
      stream = object;
    } else if (webidl.is.Blob(object)) {
      stream = object.stream();
    } else {
      stream = new ReadableStream({
        pull(controller) {
          const buffer = typeof source === "string" ? textEncoder.encode(source) : source;
          if (buffer.byteLength) {
            controller.enqueue(buffer);
          }
          queueMicrotask(() => readableStreamClose(controller));
        },
        start() {
        },
        type: "bytes"
      });
    }
    assert(webidl.is.ReadableStream(stream));
    let action = null;
    let source = null;
    let length = null;
    let type = null;
    if (typeof object === "string") {
      source = object;
      type = "text/plain;charset=UTF-8";
    } else if (webidl.is.URLSearchParams(object)) {
      source = object.toString();
      type = "application/x-www-form-urlencoded;charset=UTF-8";
    } else if (webidl.is.BufferSource(object)) {
      source = isArrayBuffer(object) ? new Uint8Array(object.slice()) : new Uint8Array(object.buffer.slice(object.byteOffset, object.byteOffset + object.byteLength));
    } else if (webidl.is.FormData(object)) {
      const boundary = `----formdata-undici-0${`${random(1e11)}`.padStart(11, "0")}`;
      const prefix = `--${boundary}\r
Content-Disposition: form-data`;
      /*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
      const formdataEscape = (str) => str.replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22");
      const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, "\r\n");
      const blobParts = [];
      const rn = new Uint8Array([13, 10]);
      length = 0;
      let hasUnknownSizeValue = false;
      for (const [name, value] of object) {
        if (typeof value === "string") {
          const chunk2 = textEncoder.encode(prefix + `; name="${formdataEscape(normalizeLinefeeds(name))}"\r
\r
${normalizeLinefeeds(value)}\r
`);
          blobParts.push(chunk2);
          length += chunk2.byteLength;
        } else {
          const chunk2 = textEncoder.encode(`${prefix}; name="${formdataEscape(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${formdataEscape(value.name)}"` : "") + `\r
Content-Type: ${value.type || "application/octet-stream"}\r
\r
`);
          blobParts.push(chunk2, value, rn);
          if (typeof value.size === "number") {
            length += chunk2.byteLength + value.size + rn.byteLength;
          } else {
            hasUnknownSizeValue = true;
          }
        }
      }
      const chunk = textEncoder.encode(`--${boundary}--\r
`);
      blobParts.push(chunk);
      length += chunk.byteLength;
      if (hasUnknownSizeValue) {
        length = null;
      }
      source = object;
      action = async function* () {
        for (const part of blobParts) {
          if (part.stream) {
            yield* part.stream();
          } else {
            yield part;
          }
        }
      };
      type = `multipart/form-data; boundary=${boundary}`;
    } else if (webidl.is.Blob(object)) {
      source = object;
      length = object.size;
      if (object.type) {
        type = object.type;
      }
    } else if (typeof object[Symbol.asyncIterator] === "function") {
      if (keepalive) {
        throw new TypeError("keepalive");
      }
      if (util.isDisturbed(object) || object.locked) {
        throw new TypeError(
          "Response body object should not be disturbed or locked"
        );
      }
      stream = webidl.is.ReadableStream(object) ? object : ReadableStreamFrom(object);
    }
    if (typeof source === "string" || util.isBuffer(source)) {
      length = Buffer.byteLength(source);
    }
    if (action != null) {
      let iterator;
      stream = new ReadableStream({
        async start() {
          iterator = action(object)[Symbol.asyncIterator]();
        },
        async pull(controller) {
          const { value, done } = await iterator.next();
          if (done) {
            queueMicrotask(() => {
              controller.close();
              controller.byobRequest?.respond(0);
            });
          } else {
            if (!isErrored(stream)) {
              const buffer = new Uint8Array(value);
              if (buffer.byteLength) {
                controller.enqueue(buffer);
              }
            }
          }
          return controller.desiredSize > 0;
        },
        async cancel(reason) {
          await iterator.return();
        },
        type: "bytes"
      });
    }
    const body2 = { stream, source, length };
    return [body2, type];
  }
  function safelyExtractBody(object, keepalive = false) {
    if (webidl.is.ReadableStream(object)) {
      assert(!util.isDisturbed(object), "The body has already been consumed.");
      assert(!object.locked, "The stream is locked.");
    }
    return extractBody(object, keepalive);
  }
  function cloneBody(body2) {
    const { 0: out1, 1: out2 } = body2.stream.tee();
    body2.stream = out1;
    return {
      stream: out2,
      length: body2.length,
      source: body2.source
    };
  }
  function bodyMixinMethods(instance, getInternalState) {
    const methods = {
      blob() {
        return consumeBody(this, (bytes) => {
          let mimeType = bodyMimeType(getInternalState(this));
          if (mimeType === null) {
            mimeType = "";
          } else if (mimeType) {
            mimeType = serializeAMimeType(mimeType);
          }
          return new Blob([bytes], { type: mimeType });
        }, instance, getInternalState);
      },
      arrayBuffer() {
        return consumeBody(this, (bytes) => {
          return new Uint8Array(bytes).buffer;
        }, instance, getInternalState);
      },
      text() {
        return consumeBody(this, utf8DecodeBytes, instance, getInternalState);
      },
      json() {
        return consumeBody(this, parseJSONFromBytes, instance, getInternalState);
      },
      formData() {
        return consumeBody(this, (value) => {
          const mimeType = bodyMimeType(getInternalState(this));
          if (mimeType !== null) {
            switch (mimeType.essence) {
              case "multipart/form-data": {
                const parsed = multipartFormDataParser(value, mimeType);
                const fd = new FormData();
                setFormDataState(fd, parsed);
                return fd;
              }
              case "application/x-www-form-urlencoded": {
                const entries = new URLSearchParams(value.toString());
                const fd = new FormData();
                for (const [name, value2] of entries) {
                  fd.append(name, value2);
                }
                return fd;
              }
            }
          }
          throw new TypeError(
            'Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".'
          );
        }, instance, getInternalState);
      },
      bytes() {
        return consumeBody(this, (bytes) => {
          return new Uint8Array(bytes);
        }, instance, getInternalState);
      }
    };
    return methods;
  }
  function mixinBody(prototype, getInternalState) {
    Object.assign(prototype.prototype, bodyMixinMethods(prototype, getInternalState));
  }
  function consumeBody(object, convertBytesToJSValue, instance, getInternalState) {
    try {
      webidl.brandCheck(object, instance);
    } catch (e) {
      return Promise.reject(e);
    }
    const state = getInternalState(object);
    if (bodyUnusable(state)) {
      return Promise.reject(new TypeError("Body is unusable: Body has already been read"));
    }
    if (state.aborted) {
      return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
    }
    const promise = createDeferredPromise();
    const errorSteps = promise.reject;
    const successSteps = (data) => {
      try {
        promise.resolve(convertBytesToJSValue(data));
      } catch (e) {
        errorSteps(e);
      }
    };
    if (state.body == null) {
      successSteps(Buffer.allocUnsafe(0));
      return promise.promise;
    }
    fullyReadBody(state.body, successSteps, errorSteps);
    return promise.promise;
  }
  function bodyUnusable(object) {
    const body2 = object.body;
    return body2 != null && (body2.stream.locked || util.isDisturbed(body2.stream));
  }
  function parseJSONFromBytes(bytes) {
    return JSON.parse(utf8DecodeBytes(bytes));
  }
  function bodyMimeType(requestOrResponse) {
    const headers = requestOrResponse.headersList;
    const mimeType = extractMimeType(headers);
    if (mimeType === "failure") {
      return null;
    }
    return mimeType;
  }
  body = {
    extractBody,
    safelyExtractBody,
    cloneBody,
    mixinBody,
    streamRegistry,
    bodyUnusable
  };
  return body;
}
export {
  requireBody as __require
};
//# sourceMappingURL=index89.js.map
