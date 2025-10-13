import require$$0 from "node:stream";
import require$$0$2 from "node:zlib";
import { __require as requireConstants } from "./index90.js";
import { __require as requireGlobal } from "./index51.js";
import { __require as requireDataUrl } from "./index55.js";
import require$$5 from "node:perf_hooks";
import { __require as requireUtil$1 } from "./index24.js";
import require$$0$1 from "node:assert";
import require$$8 from "node:util/types";
import { __require as requireWebidl } from "./index91.js";
var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  const { Transform } = require$$0;
  const zlib = require$$0$2;
  const { redirectStatusSet, referrerPolicyTokens, badPortsSet } = requireConstants();
  const { getGlobalOrigin } = requireGlobal();
  const { collectASequenceOfCodePoints, collectAnHTTPQuotedString, removeChars, parseMIMEType } = requireDataUrl();
  const { performance } = require$$5;
  const { ReadableStreamFrom, isValidHTTPToken, normalizedMethodRecordsBase } = requireUtil$1();
  const assert = require$$0$1;
  const { isUint8Array } = require$$8;
  const { webidl } = requireWebidl();
  function responseURL(response) {
    const urlList = response.urlList;
    const length = urlList.length;
    return length === 0 ? null : urlList[length - 1].toString();
  }
  function responseLocationURL(response, requestFragment) {
    if (!redirectStatusSet.has(response.status)) {
      return null;
    }
    let location = response.headersList.get("location", true);
    if (location !== null && isValidHeaderValue(location)) {
      if (!isValidEncodedURL(location)) {
        location = normalizeBinaryStringToUtf8(location);
      }
      location = new URL(location, responseURL(response));
    }
    if (location && !location.hash) {
      location.hash = requestFragment;
    }
    return location;
  }
  function isValidEncodedURL(url) {
    for (let i = 0; i < url.length; ++i) {
      const code = url.charCodeAt(i);
      if (code > 126 || // Non-US-ASCII + DEL
      code < 32) {
        return false;
      }
    }
    return true;
  }
  function normalizeBinaryStringToUtf8(value) {
    return Buffer.from(value, "binary").toString("utf8");
  }
  function requestCurrentURL(request) {
    return request.urlList[request.urlList.length - 1];
  }
  function requestBadPort(request) {
    const url = requestCurrentURL(request);
    if (urlIsHttpHttpsScheme(url) && badPortsSet.has(url.port)) {
      return "blocked";
    }
    return "allowed";
  }
  function isErrorLike(object) {
    return object instanceof Error || (object?.constructor?.name === "Error" || object?.constructor?.name === "DOMException");
  }
  function isValidReasonPhrase(statusText) {
    for (let i = 0; i < statusText.length; ++i) {
      const c = statusText.charCodeAt(i);
      if (!(c === 9 || // HTAB
      c >= 32 && c <= 126 || // SP / VCHAR
      c >= 128 && c <= 255)) {
        return false;
      }
    }
    return true;
  }
  const isValidHeaderName = isValidHTTPToken;
  function isValidHeaderValue(potentialValue) {
    return (potentialValue[0] === "	" || potentialValue[0] === " " || potentialValue[potentialValue.length - 1] === "	" || potentialValue[potentialValue.length - 1] === " " || potentialValue.includes("\n") || potentialValue.includes("\r") || potentialValue.includes("\0")) === false;
  }
  function parseReferrerPolicy(actualResponse) {
    const policyHeader = (actualResponse.headersList.get("referrer-policy", true) ?? "").split(",");
    let policy = "";
    if (policyHeader.length) {
      for (let i = policyHeader.length; i !== 0; i--) {
        const token = policyHeader[i - 1].trim();
        if (referrerPolicyTokens.has(token)) {
          policy = token;
          break;
        }
      }
    }
    return policy;
  }
  function setRequestReferrerPolicyOnRedirect(request, actualResponse) {
    const policy = parseReferrerPolicy(actualResponse);
    if (policy !== "") {
      request.referrerPolicy = policy;
    }
  }
  function crossOriginResourcePolicyCheck() {
    return "allowed";
  }
  function corsCheck() {
    return "success";
  }
  function TAOCheck() {
    return "success";
  }
  function appendFetchMetadata(httpRequest) {
    let header = null;
    header = httpRequest.mode;
    httpRequest.headersList.set("sec-fetch-mode", header, true);
  }
  function appendRequestOriginHeader(request) {
    let serializedOrigin = request.origin;
    if (serializedOrigin === "client" || serializedOrigin === void 0) {
      return;
    }
    if (request.responseTainting === "cors" || request.mode === "websocket") {
      request.headersList.append("origin", serializedOrigin, true);
    } else if (request.method !== "GET" && request.method !== "HEAD") {
      switch (request.referrerPolicy) {
        case "no-referrer":
          serializedOrigin = null;
          break;
        case "no-referrer-when-downgrade":
        case "strict-origin":
        case "strict-origin-when-cross-origin":
          if (request.origin && urlHasHttpsScheme(request.origin) && !urlHasHttpsScheme(requestCurrentURL(request))) {
            serializedOrigin = null;
          }
          break;
        case "same-origin":
          if (!sameOrigin(request, requestCurrentURL(request))) {
            serializedOrigin = null;
          }
          break;
      }
      request.headersList.append("origin", serializedOrigin, true);
    }
  }
  function coarsenTime(timestamp, crossOriginIsolatedCapability) {
    return timestamp;
  }
  function clampAndCoarsenConnectionTimingInfo(connectionTimingInfo, defaultStartTime, crossOriginIsolatedCapability) {
    if (!connectionTimingInfo?.startTime || connectionTimingInfo.startTime < defaultStartTime) {
      return {
        domainLookupStartTime: defaultStartTime,
        domainLookupEndTime: defaultStartTime,
        connectionStartTime: defaultStartTime,
        connectionEndTime: defaultStartTime,
        secureConnectionStartTime: defaultStartTime,
        ALPNNegotiatedProtocol: connectionTimingInfo?.ALPNNegotiatedProtocol
      };
    }
    return {
      domainLookupStartTime: coarsenTime(connectionTimingInfo.domainLookupStartTime),
      domainLookupEndTime: coarsenTime(connectionTimingInfo.domainLookupEndTime),
      connectionStartTime: coarsenTime(connectionTimingInfo.connectionStartTime),
      connectionEndTime: coarsenTime(connectionTimingInfo.connectionEndTime),
      secureConnectionStartTime: coarsenTime(connectionTimingInfo.secureConnectionStartTime),
      ALPNNegotiatedProtocol: connectionTimingInfo.ALPNNegotiatedProtocol
    };
  }
  function coarsenedSharedCurrentTime(crossOriginIsolatedCapability) {
    return coarsenTime(performance.now());
  }
  function createOpaqueTimingInfo(timingInfo) {
    return {
      startTime: timingInfo.startTime ?? 0,
      redirectStartTime: 0,
      redirectEndTime: 0,
      postRedirectStartTime: timingInfo.startTime ?? 0,
      finalServiceWorkerStartTime: 0,
      finalNetworkResponseStartTime: 0,
      finalNetworkRequestStartTime: 0,
      endTime: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      finalConnectionTimingInfo: null
    };
  }
  function makePolicyContainer() {
    return {
      referrerPolicy: "strict-origin-when-cross-origin"
    };
  }
  function clonePolicyContainer(policyContainer) {
    return {
      referrerPolicy: policyContainer.referrerPolicy
    };
  }
  function determineRequestsReferrer(request) {
    const policy = request.referrerPolicy;
    assert(policy);
    let referrerSource = null;
    if (request.referrer === "client") {
      const globalOrigin = getGlobalOrigin();
      if (!globalOrigin || globalOrigin.origin === "null") {
        return "no-referrer";
      }
      referrerSource = new URL(globalOrigin);
    } else if (webidl.is.URL(request.referrer)) {
      referrerSource = request.referrer;
    }
    let referrerURL = stripURLForReferrer(referrerSource);
    const referrerOrigin = stripURLForReferrer(referrerSource, true);
    if (referrerURL.toString().length > 4096) {
      referrerURL = referrerOrigin;
    }
    switch (policy) {
      case "no-referrer":
        return "no-referrer";
      case "origin":
        if (referrerOrigin != null) {
          return referrerOrigin;
        }
        return stripURLForReferrer(referrerSource, true);
      case "unsafe-url":
        return referrerURL;
      case "strict-origin": {
        const currentURL = requestCurrentURL(request);
        if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) {
          return "no-referrer";
        }
        return referrerOrigin;
      }
      case "strict-origin-when-cross-origin": {
        const currentURL = requestCurrentURL(request);
        if (sameOrigin(referrerURL, currentURL)) {
          return referrerURL;
        }
        if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) {
          return "no-referrer";
        }
        return referrerOrigin;
      }
      case "same-origin":
        if (sameOrigin(request, referrerURL)) {
          return referrerURL;
        }
        return "no-referrer";
      case "origin-when-cross-origin":
        if (sameOrigin(request, referrerURL)) {
          return referrerURL;
        }
        return referrerOrigin;
      case "no-referrer-when-downgrade": {
        const currentURL = requestCurrentURL(request);
        if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) {
          return "no-referrer";
        }
        return referrerURL;
      }
    }
  }
  function stripURLForReferrer(url, originOnly = false) {
    assert(webidl.is.URL(url));
    url = new URL(url);
    if (urlIsLocal(url)) {
      return "no-referrer";
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    if (originOnly === true) {
      url.pathname = "";
      url.search = "";
    }
    return url;
  }
  const isPotentialleTrustworthyIPv4 = RegExp.prototype.test.bind(/^127\.(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){2}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/);
  const isPotentiallyTrustworthyIPv6 = RegExp.prototype.test.bind(/^(?:(?:0{1,4}:){7}|(?:0{1,4}:){1,6}:|::)0{0,3}1$/);
  function isOriginIPPotentiallyTrustworthy(origin) {
    if (origin.includes(":")) {
      if (origin[0] === "[" && origin[origin.length - 1] === "]") {
        origin = origin.slice(1, -1);
      }
      return isPotentiallyTrustworthyIPv6(origin);
    }
    return isPotentialleTrustworthyIPv4(origin);
  }
  function isOriginPotentiallyTrustworthy(origin) {
    if (origin == null || origin === "null") {
      return false;
    }
    origin = new URL(origin);
    if (origin.protocol === "https:" || origin.protocol === "wss:") {
      return true;
    }
    if (isOriginIPPotentiallyTrustworthy(origin.hostname)) {
      return true;
    }
    if (origin.hostname === "localhost" || origin.hostname === "localhost.") {
      return true;
    }
    if (origin.hostname.endsWith(".localhost") || origin.hostname.endsWith(".localhost.")) {
      return true;
    }
    if (origin.protocol === "file:") {
      return true;
    }
    return false;
  }
  function isURLPotentiallyTrustworthy(url) {
    if (!webidl.is.URL(url)) {
      return false;
    }
    if (url.href === "about:blank" || url.href === "about:srcdoc") {
      return true;
    }
    if (url.protocol === "data:") return true;
    if (url.protocol === "blob:") return true;
    return isOriginPotentiallyTrustworthy(url.origin);
  }
  function tryUpgradeRequestToAPotentiallyTrustworthyURL(request) {
  }
  function sameOrigin(A, B) {
    if (A.origin === B.origin && A.origin === "null") {
      return true;
    }
    if (A.protocol === B.protocol && A.hostname === B.hostname && A.port === B.port) {
      return true;
    }
    return false;
  }
  function isAborted(fetchParams) {
    return fetchParams.controller.state === "aborted";
  }
  function isCancelled(fetchParams) {
    return fetchParams.controller.state === "aborted" || fetchParams.controller.state === "terminated";
  }
  function normalizeMethod(method) {
    return normalizedMethodRecordsBase[method.toLowerCase()] ?? method;
  }
  function serializeJavascriptValueToJSONString(value) {
    const result = JSON.stringify(value);
    if (result === void 0) {
      throw new TypeError("Value is not JSON serializable");
    }
    assert(typeof result === "string");
    return result;
  }
  const esIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  function createIterator(name, kInternalIterator, keyIndex = 0, valueIndex = 1) {
    class FastIterableIterator {
      /** @type {any} */
      #target;
      /** @type {'key' | 'value' | 'key+value'} */
      #kind;
      /** @type {number} */
      #index;
      /**
       * @see https://webidl.spec.whatwg.org/#dfn-default-iterator-object
       * @param {unknown} target
       * @param {'key' | 'value' | 'key+value'} kind
       */
      constructor(target, kind) {
        this.#target = target;
        this.#kind = kind;
        this.#index = 0;
      }
      next() {
        if (typeof this !== "object" || this === null || !(#target in this)) {
          throw new TypeError(
            `'next' called on an object that does not implement interface ${name} Iterator.`
          );
        }
        const index = this.#index;
        const values = kInternalIterator(this.#target);
        const len = values.length;
        if (index >= len) {
          return {
            value: void 0,
            done: true
          };
        }
        const { [keyIndex]: key, [valueIndex]: value } = values[index];
        this.#index = index + 1;
        let result;
        switch (this.#kind) {
          case "key":
            result = key;
            break;
          case "value":
            result = value;
            break;
          case "key+value":
            result = [key, value];
            break;
        }
        return {
          value: result,
          done: false
        };
      }
    }
    delete FastIterableIterator.prototype.constructor;
    Object.setPrototypeOf(FastIterableIterator.prototype, esIteratorPrototype);
    Object.defineProperties(FastIterableIterator.prototype, {
      [Symbol.toStringTag]: {
        writable: false,
        enumerable: false,
        configurable: true,
        value: `${name} Iterator`
      },
      next: { writable: true, enumerable: true, configurable: true }
    });
    return function(target, kind) {
      return new FastIterableIterator(target, kind);
    };
  }
  function iteratorMixin(name, object, kInternalIterator, keyIndex = 0, valueIndex = 1) {
    const makeIterator = createIterator(name, kInternalIterator, keyIndex, valueIndex);
    const properties = {
      keys: {
        writable: true,
        enumerable: true,
        configurable: true,
        value: function keys() {
          webidl.brandCheck(this, object);
          return makeIterator(this, "key");
        }
      },
      values: {
        writable: true,
        enumerable: true,
        configurable: true,
        value: function values() {
          webidl.brandCheck(this, object);
          return makeIterator(this, "value");
        }
      },
      entries: {
        writable: true,
        enumerable: true,
        configurable: true,
        value: function entries() {
          webidl.brandCheck(this, object);
          return makeIterator(this, "key+value");
        }
      },
      forEach: {
        writable: true,
        enumerable: true,
        configurable: true,
        value: function forEach(callbackfn, thisArg = globalThis) {
          webidl.brandCheck(this, object);
          webidl.argumentLengthCheck(arguments, 1, `${name}.forEach`);
          if (typeof callbackfn !== "function") {
            throw new TypeError(
              `Failed to execute 'forEach' on '${name}': parameter 1 is not of type 'Function'.`
            );
          }
          for (const { 0: key, 1: value } of makeIterator(this, "key+value")) {
            callbackfn.call(thisArg, value, key, this);
          }
        }
      }
    };
    return Object.defineProperties(object.prototype, {
      ...properties,
      [Symbol.iterator]: {
        writable: true,
        enumerable: false,
        configurable: true,
        value: properties.entries.value
      }
    });
  }
  function fullyReadBody(body, processBody, processBodyError) {
    const successSteps = processBody;
    const errorSteps = processBodyError;
    try {
      const reader = body.stream.getReader();
      readAllBytes(reader, successSteps, errorSteps);
    } catch (e) {
      errorSteps(e);
    }
  }
  function readableStreamClose(controller) {
    try {
      controller.close();
      controller.byobRequest?.respond(0);
    } catch (err) {
      if (!err.message.includes("Controller is already closed") && !err.message.includes("ReadableStream is already closed")) {
        throw err;
      }
    }
  }
  const invalidIsomorphicEncodeValueRegex = /[^\x00-\xFF]/;
  function isomorphicEncode(input) {
    assert(!invalidIsomorphicEncodeValueRegex.test(input));
    return input;
  }
  async function readAllBytes(reader, successSteps, failureSteps) {
    try {
      const bytes = [];
      let byteLength = 0;
      do {
        const { done, value: chunk } = await reader.read();
        if (done) {
          successSteps(Buffer.concat(bytes, byteLength));
          return;
        }
        if (!isUint8Array(chunk)) {
          failureSteps(new TypeError("Received non-Uint8Array chunk"));
          return;
        }
        bytes.push(chunk);
        byteLength += chunk.length;
      } while (true);
    } catch (e) {
      failureSteps(e);
    }
  }
  function urlIsLocal(url) {
    assert("protocol" in url);
    const protocol = url.protocol;
    return protocol === "about:" || protocol === "blob:" || protocol === "data:";
  }
  function urlHasHttpsScheme(url) {
    return typeof url === "string" && url[5] === ":" && url[0] === "h" && url[1] === "t" && url[2] === "t" && url[3] === "p" && url[4] === "s" || url.protocol === "https:";
  }
  function urlIsHttpHttpsScheme(url) {
    assert("protocol" in url);
    const protocol = url.protocol;
    return protocol === "http:" || protocol === "https:";
  }
  function simpleRangeHeaderValue(value, allowWhitespace) {
    const data = value;
    if (!data.startsWith("bytes")) {
      return "failure";
    }
    const position = { position: 5 };
    if (allowWhitespace) {
      collectASequenceOfCodePoints(
        (char) => char === "	" || char === " ",
        data,
        position
      );
    }
    if (data.charCodeAt(position.position) !== 61) {
      return "failure";
    }
    position.position++;
    if (allowWhitespace) {
      collectASequenceOfCodePoints(
        (char) => char === "	" || char === " ",
        data,
        position
      );
    }
    const rangeStart = collectASequenceOfCodePoints(
      (char) => {
        const code = char.charCodeAt(0);
        return code >= 48 && code <= 57;
      },
      data,
      position
    );
    const rangeStartValue = rangeStart.length ? Number(rangeStart) : null;
    if (allowWhitespace) {
      collectASequenceOfCodePoints(
        (char) => char === "	" || char === " ",
        data,
        position
      );
    }
    if (data.charCodeAt(position.position) !== 45) {
      return "failure";
    }
    position.position++;
    if (allowWhitespace) {
      collectASequenceOfCodePoints(
        (char) => char === "	" || char === " ",
        data,
        position
      );
    }
    const rangeEnd = collectASequenceOfCodePoints(
      (char) => {
        const code = char.charCodeAt(0);
        return code >= 48 && code <= 57;
      },
      data,
      position
    );
    const rangeEndValue = rangeEnd.length ? Number(rangeEnd) : null;
    if (position.position < data.length) {
      return "failure";
    }
    if (rangeEndValue === null && rangeStartValue === null) {
      return "failure";
    }
    if (rangeStartValue > rangeEndValue) {
      return "failure";
    }
    return { rangeStartValue, rangeEndValue };
  }
  function buildContentRange(rangeStart, rangeEnd, fullLength) {
    let contentRange = "bytes ";
    contentRange += isomorphicEncode(`${rangeStart}`);
    contentRange += "-";
    contentRange += isomorphicEncode(`${rangeEnd}`);
    contentRange += "/";
    contentRange += isomorphicEncode(`${fullLength}`);
    return contentRange;
  }
  class InflateStream extends Transform {
    #zlibOptions;
    /** @param {zlib.ZlibOptions} [zlibOptions] */
    constructor(zlibOptions) {
      super();
      this.#zlibOptions = zlibOptions;
    }
    _transform(chunk, encoding, callback) {
      if (!this._inflateStream) {
        if (chunk.length === 0) {
          callback();
          return;
        }
        this._inflateStream = (chunk[0] & 15) === 8 ? zlib.createInflate(this.#zlibOptions) : zlib.createInflateRaw(this.#zlibOptions);
        this._inflateStream.on("data", this.push.bind(this));
        this._inflateStream.on("end", () => this.push(null));
        this._inflateStream.on("error", (err) => this.destroy(err));
      }
      this._inflateStream.write(chunk, encoding, callback);
    }
    _final(callback) {
      if (this._inflateStream) {
        this._inflateStream.end();
        this._inflateStream = null;
      }
      callback();
    }
  }
  function createInflate(zlibOptions) {
    return new InflateStream(zlibOptions);
  }
  function extractMimeType(headers) {
    let charset = null;
    let essence = null;
    let mimeType = null;
    const values = getDecodeSplit("content-type", headers);
    if (values === null) {
      return "failure";
    }
    for (const value of values) {
      const temporaryMimeType = parseMIMEType(value);
      if (temporaryMimeType === "failure" || temporaryMimeType.essence === "*/*") {
        continue;
      }
      mimeType = temporaryMimeType;
      if (mimeType.essence !== essence) {
        charset = null;
        if (mimeType.parameters.has("charset")) {
          charset = mimeType.parameters.get("charset");
        }
        essence = mimeType.essence;
      } else if (!mimeType.parameters.has("charset") && charset !== null) {
        mimeType.parameters.set("charset", charset);
      }
    }
    if (mimeType == null) {
      return "failure";
    }
    return mimeType;
  }
  function gettingDecodingSplitting(value) {
    const input = value;
    const position = { position: 0 };
    const values = [];
    let temporaryValue = "";
    while (position.position < input.length) {
      temporaryValue += collectASequenceOfCodePoints(
        (char) => char !== '"' && char !== ",",
        input,
        position
      );
      if (position.position < input.length) {
        if (input.charCodeAt(position.position) === 34) {
          temporaryValue += collectAnHTTPQuotedString(
            input,
            position
          );
          if (position.position < input.length) {
            continue;
          }
        } else {
          assert(input.charCodeAt(position.position) === 44);
          position.position++;
        }
      }
      temporaryValue = removeChars(temporaryValue, true, true, (char) => char === 9 || char === 32);
      values.push(temporaryValue);
      temporaryValue = "";
    }
    return values;
  }
  function getDecodeSplit(name, list) {
    const value = list.get(name, true);
    if (value === null) {
      return null;
    }
    return gettingDecodingSplitting(value);
  }
  const textDecoder = new TextDecoder();
  function utf8DecodeBytes(buffer) {
    if (buffer.length === 0) {
      return "";
    }
    if (buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
      buffer = buffer.subarray(3);
    }
    const output = textDecoder.decode(buffer);
    return output;
  }
  class EnvironmentSettingsObjectBase {
    get baseUrl() {
      return getGlobalOrigin();
    }
    get origin() {
      return this.baseUrl?.origin;
    }
    policyContainer = makePolicyContainer();
  }
  class EnvironmentSettingsObject {
    settingsObject = new EnvironmentSettingsObjectBase();
  }
  const environmentSettingsObject = new EnvironmentSettingsObject();
  util = {
    isAborted,
    isCancelled,
    isValidEncodedURL,
    ReadableStreamFrom,
    tryUpgradeRequestToAPotentiallyTrustworthyURL,
    clampAndCoarsenConnectionTimingInfo,
    coarsenedSharedCurrentTime,
    determineRequestsReferrer,
    makePolicyContainer,
    clonePolicyContainer,
    appendFetchMetadata,
    appendRequestOriginHeader,
    TAOCheck,
    corsCheck,
    crossOriginResourcePolicyCheck,
    createOpaqueTimingInfo,
    setRequestReferrerPolicyOnRedirect,
    isValidHTTPToken,
    requestBadPort,
    requestCurrentURL,
    responseURL,
    responseLocationURL,
    isURLPotentiallyTrustworthy,
    isValidReasonPhrase,
    sameOrigin,
    normalizeMethod,
    serializeJavascriptValueToJSONString,
    iteratorMixin,
    createIterator,
    isValidHeaderName,
    isValidHeaderValue,
    isErrorLike,
    fullyReadBody,
    readableStreamClose,
    isomorphicEncode,
    urlIsLocal,
    urlHasHttpsScheme,
    urlIsHttpHttpsScheme,
    readAllBytes,
    simpleRangeHeaderValue,
    buildContentRange,
    createInflate,
    extractMimeType,
    getDecodeSplit,
    utf8DecodeBytes,
    environmentSettingsObject,
    isOriginIPPotentiallyTrustworthy
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index88.js.map
