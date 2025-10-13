import { __require as requireHeaders } from "./index47.js";
import { __require as requireBody } from "./index89.js";
import { __require as requireUtil } from "./index24.js";
import require$$0 from "node:util";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireConstants } from "./index90.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireSymbols } from "./index53.js";
import require$$0$1 from "node:assert";
var response;
var hasRequiredResponse;
function requireResponse() {
  if (hasRequiredResponse) return response;
  hasRequiredResponse = 1;
  const { Headers, HeadersList, fill, getHeadersGuard, setHeadersGuard, setHeadersList } = requireHeaders();
  const { extractBody, cloneBody, mixinBody, streamRegistry, bodyUnusable } = requireBody();
  const util = requireUtil();
  const nodeUtil = require$$0;
  const { kEnumerableProperty } = util;
  const {
    isValidReasonPhrase,
    isCancelled,
    isAborted,
    serializeJavascriptValueToJSONString,
    isErrorLike,
    isomorphicEncode,
    environmentSettingsObject: relevantRealm
  } = requireUtil$1();
  const {
    redirectStatusSet,
    nullBodyStatus
  } = requireConstants();
  const { webidl } = requireWebidl();
  const { URLSerializer } = requireDataUrl();
  const { kConstruct } = requireSymbols();
  const assert = require$$0$1;
  const textEncoder = new TextEncoder("utf-8");
  class Response {
    /** @type {Headers} */
    #headers;
    #state;
    // Creates network error Response.
    static error() {
      const responseObject = fromInnerResponse(makeNetworkError(), "immutable");
      return responseObject;
    }
    // https://fetch.spec.whatwg.org/#dom-response-json
    static json(data, init = void 0) {
      webidl.argumentLengthCheck(arguments, 1, "Response.json");
      if (init !== null) {
        init = webidl.converters.ResponseInit(init);
      }
      const bytes = textEncoder.encode(
        serializeJavascriptValueToJSONString(data)
      );
      const body = extractBody(bytes);
      const responseObject = fromInnerResponse(makeResponse({}), "response");
      initializeResponse(responseObject, init, { body: body[0], type: "application/json" });
      return responseObject;
    }
    // Creates a redirect Response that redirects to url with status status.
    static redirect(url, status = 302) {
      webidl.argumentLengthCheck(arguments, 1, "Response.redirect");
      url = webidl.converters.USVString(url);
      status = webidl.converters["unsigned short"](status);
      let parsedURL;
      try {
        parsedURL = new URL(url, relevantRealm.settingsObject.baseUrl);
      } catch (err) {
        throw new TypeError(`Failed to parse URL from ${url}`, { cause: err });
      }
      if (!redirectStatusSet.has(status)) {
        throw new RangeError(`Invalid status code ${status}`);
      }
      const responseObject = fromInnerResponse(makeResponse({}), "immutable");
      responseObject.#state.status = status;
      const value = isomorphicEncode(URLSerializer(parsedURL));
      responseObject.#state.headersList.append("location", value, true);
      return responseObject;
    }
    // https://fetch.spec.whatwg.org/#dom-response
    constructor(body = null, init = void 0) {
      webidl.util.markAsUncloneable(this);
      if (body === kConstruct) {
        return;
      }
      if (body !== null) {
        body = webidl.converters.BodyInit(body, "Response", "body");
      }
      init = webidl.converters.ResponseInit(init);
      this.#state = makeResponse({});
      this.#headers = new Headers(kConstruct);
      setHeadersGuard(this.#headers, "response");
      setHeadersList(this.#headers, this.#state.headersList);
      let bodyWithType = null;
      if (body != null) {
        const [extractedBody, type] = extractBody(body);
        bodyWithType = { body: extractedBody, type };
      }
      initializeResponse(this, init, bodyWithType);
    }
    // Returns response’s type, e.g., "cors".
    get type() {
      webidl.brandCheck(this, Response);
      return this.#state.type;
    }
    // Returns response’s URL, if it has one; otherwise the empty string.
    get url() {
      webidl.brandCheck(this, Response);
      const urlList = this.#state.urlList;
      const url = urlList[urlList.length - 1] ?? null;
      if (url === null) {
        return "";
      }
      return URLSerializer(url, true);
    }
    // Returns whether response was obtained through a redirect.
    get redirected() {
      webidl.brandCheck(this, Response);
      return this.#state.urlList.length > 1;
    }
    // Returns response’s status.
    get status() {
      webidl.brandCheck(this, Response);
      return this.#state.status;
    }
    // Returns whether response’s status is an ok status.
    get ok() {
      webidl.brandCheck(this, Response);
      return this.#state.status >= 200 && this.#state.status <= 299;
    }
    // Returns response’s status message.
    get statusText() {
      webidl.brandCheck(this, Response);
      return this.#state.statusText;
    }
    // Returns response’s headers as Headers.
    get headers() {
      webidl.brandCheck(this, Response);
      return this.#headers;
    }
    get body() {
      webidl.brandCheck(this, Response);
      return this.#state.body ? this.#state.body.stream : null;
    }
    get bodyUsed() {
      webidl.brandCheck(this, Response);
      return !!this.#state.body && util.isDisturbed(this.#state.body.stream);
    }
    // Returns a clone of response.
    clone() {
      webidl.brandCheck(this, Response);
      if (bodyUnusable(this.#state)) {
        throw webidl.errors.exception({
          header: "Response.clone",
          message: "Body has already been consumed."
        });
      }
      const clonedResponse = cloneResponse(this.#state);
      if (this.#state.body?.stream) {
        streamRegistry.register(this, new WeakRef(this.#state.body.stream));
      }
      return fromInnerResponse(clonedResponse, getHeadersGuard(this.#headers));
    }
    [nodeUtil.inspect.custom](depth, options) {
      if (options.depth === null) {
        options.depth = 2;
      }
      options.colors ??= true;
      const properties = {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers,
        body: this.body,
        bodyUsed: this.bodyUsed,
        ok: this.ok,
        redirected: this.redirected,
        type: this.type,
        url: this.url
      };
      return `Response ${nodeUtil.formatWithOptions(options, properties)}`;
    }
    /**
     * @param {Response} response
     */
    static getResponseHeaders(response2) {
      return response2.#headers;
    }
    /**
     * @param {Response} response
     * @param {Headers} newHeaders
     */
    static setResponseHeaders(response2, newHeaders) {
      response2.#headers = newHeaders;
    }
    /**
     * @param {Response} response
     */
    static getResponseState(response2) {
      return response2.#state;
    }
    /**
     * @param {Response} response
     * @param {any} newState
     */
    static setResponseState(response2, newState) {
      response2.#state = newState;
    }
  }
  const { getResponseHeaders, setResponseHeaders, getResponseState, setResponseState } = Response;
  Reflect.deleteProperty(Response, "getResponseHeaders");
  Reflect.deleteProperty(Response, "setResponseHeaders");
  Reflect.deleteProperty(Response, "getResponseState");
  Reflect.deleteProperty(Response, "setResponseState");
  mixinBody(Response, getResponseState);
  Object.defineProperties(Response.prototype, {
    type: kEnumerableProperty,
    url: kEnumerableProperty,
    status: kEnumerableProperty,
    ok: kEnumerableProperty,
    redirected: kEnumerableProperty,
    statusText: kEnumerableProperty,
    headers: kEnumerableProperty,
    clone: kEnumerableProperty,
    body: kEnumerableProperty,
    bodyUsed: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "Response",
      configurable: true
    }
  });
  Object.defineProperties(Response, {
    json: kEnumerableProperty,
    redirect: kEnumerableProperty,
    error: kEnumerableProperty
  });
  function cloneResponse(response2) {
    if (response2.internalResponse) {
      return filterResponse(
        cloneResponse(response2.internalResponse),
        response2.type
      );
    }
    const newResponse = makeResponse({ ...response2, body: null });
    if (response2.body != null) {
      newResponse.body = cloneBody(response2.body);
    }
    return newResponse;
  }
  function makeResponse(init) {
    return {
      aborted: false,
      rangeRequested: false,
      timingAllowPassed: false,
      requestIncludesCredentials: false,
      type: "default",
      status: 200,
      timingInfo: null,
      cacheState: "",
      statusText: "",
      ...init,
      headersList: init?.headersList ? new HeadersList(init?.headersList) : new HeadersList(),
      urlList: init?.urlList ? [...init.urlList] : []
    };
  }
  function makeNetworkError(reason) {
    const isError = isErrorLike(reason);
    return makeResponse({
      type: "error",
      status: 0,
      error: isError ? reason : new Error(reason ? String(reason) : reason),
      aborted: reason && reason.name === "AbortError"
    });
  }
  function isNetworkError(response2) {
    return (
      // A network error is a response whose type is "error",
      response2.type === "error" && // status is 0
      response2.status === 0
    );
  }
  function makeFilteredResponse(response2, state) {
    state = {
      internalResponse: response2,
      ...state
    };
    return new Proxy(response2, {
      get(target, p) {
        return p in state ? state[p] : target[p];
      },
      set(target, p, value) {
        assert(!(p in state));
        target[p] = value;
        return true;
      }
    });
  }
  function filterResponse(response2, type) {
    if (type === "basic") {
      return makeFilteredResponse(response2, {
        type: "basic",
        headersList: response2.headersList
      });
    } else if (type === "cors") {
      return makeFilteredResponse(response2, {
        type: "cors",
        headersList: response2.headersList
      });
    } else if (type === "opaque") {
      return makeFilteredResponse(response2, {
        type: "opaque",
        urlList: Object.freeze([]),
        status: 0,
        statusText: "",
        body: null
      });
    } else if (type === "opaqueredirect") {
      return makeFilteredResponse(response2, {
        type: "opaqueredirect",
        status: 0,
        statusText: "",
        headersList: [],
        body: null
      });
    } else {
      assert(false);
    }
  }
  function makeAppropriateNetworkError(fetchParams, err = null) {
    assert(isCancelled(fetchParams));
    return isAborted(fetchParams) ? makeNetworkError(Object.assign(new DOMException("The operation was aborted.", "AbortError"), { cause: err })) : makeNetworkError(Object.assign(new DOMException("Request was cancelled."), { cause: err }));
  }
  function initializeResponse(response2, init, body) {
    if (init.status !== null && (init.status < 200 || init.status > 599)) {
      throw new RangeError('init["status"] must be in the range of 200 to 599, inclusive.');
    }
    if ("statusText" in init && init.statusText != null) {
      if (!isValidReasonPhrase(String(init.statusText))) {
        throw new TypeError("Invalid statusText");
      }
    }
    if ("status" in init && init.status != null) {
      getResponseState(response2).status = init.status;
    }
    if ("statusText" in init && init.statusText != null) {
      getResponseState(response2).statusText = init.statusText;
    }
    if ("headers" in init && init.headers != null) {
      fill(getResponseHeaders(response2), init.headers);
    }
    if (body) {
      if (nullBodyStatus.includes(response2.status)) {
        throw webidl.errors.exception({
          header: "Response constructor",
          message: `Invalid response status code ${response2.status}`
        });
      }
      getResponseState(response2).body = body.body;
      if (body.type != null && !getResponseState(response2).headersList.contains("content-type", true)) {
        getResponseState(response2).headersList.append("content-type", body.type, true);
      }
    }
  }
  function fromInnerResponse(innerResponse, guard) {
    const response2 = new Response(kConstruct);
    setResponseState(response2, innerResponse);
    const headers = new Headers(kConstruct);
    setResponseHeaders(response2, headers);
    setHeadersList(headers, innerResponse.headersList);
    setHeadersGuard(headers, guard);
    if (innerResponse.body?.stream) {
      streamRegistry.register(response2, new WeakRef(innerResponse.body.stream));
    }
    return response2;
  }
  webidl.converters.XMLHttpRequestBodyInit = function(V, prefix, name) {
    if (typeof V === "string") {
      return webidl.converters.USVString(V, prefix, name);
    }
    if (webidl.is.Blob(V)) {
      return V;
    }
    if (webidl.is.BufferSource(V)) {
      return V;
    }
    if (webidl.is.FormData(V)) {
      return V;
    }
    if (webidl.is.URLSearchParams(V)) {
      return V;
    }
    return webidl.converters.DOMString(V, prefix, name);
  };
  webidl.converters.BodyInit = function(V, prefix, argument) {
    if (webidl.is.ReadableStream(V)) {
      return V;
    }
    if (V?.[Symbol.asyncIterator]) {
      return V;
    }
    return webidl.converters.XMLHttpRequestBodyInit(V, prefix, argument);
  };
  webidl.converters.ResponseInit = webidl.dictionaryConverter([
    {
      key: "status",
      converter: webidl.converters["unsigned short"],
      defaultValue: () => 200
    },
    {
      key: "statusText",
      converter: webidl.converters.ByteString,
      defaultValue: () => ""
    },
    {
      key: "headers",
      converter: webidl.converters.HeadersInit
    }
  ]);
  webidl.is.Response = webidl.util.MakeTypeAssertion(Response);
  response = {
    isNetworkError,
    makeNetworkError,
    makeResponse,
    makeAppropriateNetworkError,
    filterResponse,
    Response,
    cloneResponse,
    fromInnerResponse,
    getResponseState
  };
  return response;
}
export {
  requireResponse as __require
};
//# sourceMappingURL=index48.js.map
