import { __require as requireBody } from "./index89.js";
import { __require as requireHeaders } from "./index47.js";
import { __require as requireUtil } from "./index24.js";
import require$$0$1 from "node:util";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireConstants } from "./index90.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireSymbols } from "./index53.js";
import require$$0 from "node:assert";
import require$$6 from "node:events";
var request;
var hasRequiredRequest;
function requireRequest() {
  if (hasRequiredRequest) return request;
  hasRequiredRequest = 1;
  const { extractBody, mixinBody, cloneBody, bodyUnusable } = requireBody();
  const { Headers, fill: fillHeaders, HeadersList, setHeadersGuard, getHeadersGuard, setHeadersList, getHeadersList } = requireHeaders();
  const util = requireUtil();
  const nodeUtil = require$$0$1;
  const {
    isValidHTTPToken,
    sameOrigin,
    environmentSettingsObject
  } = requireUtil$1();
  const {
    forbiddenMethodsSet,
    corsSafeListedMethodsSet,
    referrerPolicy,
    requestRedirect,
    requestMode,
    requestCredentials,
    requestCache,
    requestDuplex
  } = requireConstants();
  const { kEnumerableProperty, normalizedMethodRecordsBase, normalizedMethodRecords } = util;
  const { webidl } = requireWebidl();
  const { URLSerializer } = requireDataUrl();
  const { kConstruct } = requireSymbols();
  const assert = require$$0;
  const { getMaxListeners, setMaxListeners, defaultMaxListeners } = require$$6;
  const kAbortController = Symbol("abortController");
  const requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
    signal.removeEventListener("abort", abort);
  });
  const dependentControllerMap = /* @__PURE__ */ new WeakMap();
  let abortSignalHasEventHandlerLeakWarning;
  try {
    abortSignalHasEventHandlerLeakWarning = getMaxListeners(new AbortController().signal) > 0;
  } catch {
    abortSignalHasEventHandlerLeakWarning = false;
  }
  function buildAbort(acRef) {
    return abort;
    function abort() {
      const ac = acRef.deref();
      if (ac !== void 0) {
        requestFinalizer.unregister(abort);
        this.removeEventListener("abort", abort);
        ac.abort(this.reason);
        const controllerList = dependentControllerMap.get(ac.signal);
        if (controllerList !== void 0) {
          if (controllerList.size !== 0) {
            for (const ref of controllerList) {
              const ctrl = ref.deref();
              if (ctrl !== void 0) {
                ctrl.abort(this.reason);
              }
            }
            controllerList.clear();
          }
          dependentControllerMap.delete(ac.signal);
        }
      }
    }
  }
  let patchMethodWarning = false;
  class Request {
    /** @type {AbortSignal} */
    #signal;
    /** @type {import('../../dispatcher/dispatcher')} */
    #dispatcher;
    /** @type {Headers} */
    #headers;
    #state;
    // https://fetch.spec.whatwg.org/#dom-request
    constructor(input, init = void 0) {
      webidl.util.markAsUncloneable(this);
      if (input === kConstruct) {
        return;
      }
      const prefix = "Request constructor";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      input = webidl.converters.RequestInfo(input);
      init = webidl.converters.RequestInit(init);
      let request2 = null;
      let fallbackMode = null;
      const baseUrl = environmentSettingsObject.settingsObject.baseUrl;
      let signal = null;
      if (typeof input === "string") {
        this.#dispatcher = init.dispatcher;
        let parsedURL;
        try {
          parsedURL = new URL(input, baseUrl);
        } catch (err) {
          throw new TypeError("Failed to parse URL from " + input, { cause: err });
        }
        if (parsedURL.username || parsedURL.password) {
          throw new TypeError(
            "Request cannot be constructed from a URL that includes credentials: " + input
          );
        }
        request2 = makeRequest({ urlList: [parsedURL] });
        fallbackMode = "cors";
      } else {
        assert(webidl.is.Request(input));
        request2 = input.#state;
        signal = input.#signal;
        this.#dispatcher = init.dispatcher || input.#dispatcher;
      }
      const origin = environmentSettingsObject.settingsObject.origin;
      let window = "client";
      if (request2.window?.constructor?.name === "EnvironmentSettingsObject" && sameOrigin(request2.window, origin)) {
        window = request2.window;
      }
      if (init.window != null) {
        throw new TypeError(`'window' option '${window}' must be null`);
      }
      if ("window" in init) {
        window = "no-window";
      }
      request2 = makeRequest({
        // URL request’s URL.
        // undici implementation note: this is set as the first item in request's urlList in makeRequest
        // method request’s method.
        method: request2.method,
        // header list A copy of request’s header list.
        // undici implementation note: headersList is cloned in makeRequest
        headersList: request2.headersList,
        // unsafe-request flag Set.
        unsafeRequest: request2.unsafeRequest,
        // client This’s relevant settings object.
        client: environmentSettingsObject.settingsObject,
        // window window.
        window,
        // priority request’s priority.
        priority: request2.priority,
        // origin request’s origin. The propagation of the origin is only significant for navigation requests
        // being handled by a service worker. In this scenario a request can have an origin that is different
        // from the current client.
        origin: request2.origin,
        // referrer request’s referrer.
        referrer: request2.referrer,
        // referrer policy request’s referrer policy.
        referrerPolicy: request2.referrerPolicy,
        // mode request’s mode.
        mode: request2.mode,
        // credentials mode request’s credentials mode.
        credentials: request2.credentials,
        // cache mode request’s cache mode.
        cache: request2.cache,
        // redirect mode request’s redirect mode.
        redirect: request2.redirect,
        // integrity metadata request’s integrity metadata.
        integrity: request2.integrity,
        // keepalive request’s keepalive.
        keepalive: request2.keepalive,
        // reload-navigation flag request’s reload-navigation flag.
        reloadNavigation: request2.reloadNavigation,
        // history-navigation flag request’s history-navigation flag.
        historyNavigation: request2.historyNavigation,
        // URL list A clone of request’s URL list.
        urlList: [...request2.urlList]
      });
      const initHasKey = Object.keys(init).length !== 0;
      if (initHasKey) {
        if (request2.mode === "navigate") {
          request2.mode = "same-origin";
        }
        request2.reloadNavigation = false;
        request2.historyNavigation = false;
        request2.origin = "client";
        request2.referrer = "client";
        request2.referrerPolicy = "";
        request2.url = request2.urlList[request2.urlList.length - 1];
        request2.urlList = [request2.url];
      }
      if (init.referrer !== void 0) {
        const referrer = init.referrer;
        if (referrer === "") {
          request2.referrer = "no-referrer";
        } else {
          let parsedReferrer;
          try {
            parsedReferrer = new URL(referrer, baseUrl);
          } catch (err) {
            throw new TypeError(`Referrer "${referrer}" is not a valid URL.`, { cause: err });
          }
          if (parsedReferrer.protocol === "about:" && parsedReferrer.hostname === "client" || origin && !sameOrigin(parsedReferrer, environmentSettingsObject.settingsObject.baseUrl)) {
            request2.referrer = "client";
          } else {
            request2.referrer = parsedReferrer;
          }
        }
      }
      if (init.referrerPolicy !== void 0) {
        request2.referrerPolicy = init.referrerPolicy;
      }
      let mode;
      if (init.mode !== void 0) {
        mode = init.mode;
      } else {
        mode = fallbackMode;
      }
      if (mode === "navigate") {
        throw webidl.errors.exception({
          header: "Request constructor",
          message: "invalid request mode navigate."
        });
      }
      if (mode != null) {
        request2.mode = mode;
      }
      if (init.credentials !== void 0) {
        request2.credentials = init.credentials;
      }
      if (init.cache !== void 0) {
        request2.cache = init.cache;
      }
      if (request2.cache === "only-if-cached" && request2.mode !== "same-origin") {
        throw new TypeError(
          "'only-if-cached' can be set only with 'same-origin' mode"
        );
      }
      if (init.redirect !== void 0) {
        request2.redirect = init.redirect;
      }
      if (init.integrity != null) {
        request2.integrity = String(init.integrity);
      }
      if (init.keepalive !== void 0) {
        request2.keepalive = Boolean(init.keepalive);
      }
      if (init.method !== void 0) {
        let method = init.method;
        const mayBeNormalized = normalizedMethodRecords[method];
        if (mayBeNormalized !== void 0) {
          request2.method = mayBeNormalized;
        } else {
          if (!isValidHTTPToken(method)) {
            throw new TypeError(`'${method}' is not a valid HTTP method.`);
          }
          const upperCase = method.toUpperCase();
          if (forbiddenMethodsSet.has(upperCase)) {
            throw new TypeError(`'${method}' HTTP method is unsupported.`);
          }
          method = normalizedMethodRecordsBase[upperCase] ?? method;
          request2.method = method;
        }
        if (!patchMethodWarning && request2.method === "patch") {
          process.emitWarning("Using `patch` is highly likely to result in a `405 Method Not Allowed`. `PATCH` is much more likely to succeed.", {
            code: "UNDICI-FETCH-patch"
          });
          patchMethodWarning = true;
        }
      }
      if (init.signal !== void 0) {
        signal = init.signal;
      }
      this.#state = request2;
      const ac = new AbortController();
      this.#signal = ac.signal;
      if (signal != null) {
        if (signal.aborted) {
          ac.abort(signal.reason);
        } else {
          this[kAbortController] = ac;
          const acRef = new WeakRef(ac);
          const abort = buildAbort(acRef);
          if (abortSignalHasEventHandlerLeakWarning && getMaxListeners(signal) === defaultMaxListeners) {
            setMaxListeners(1500, signal);
          }
          util.addAbortListener(signal, abort);
          requestFinalizer.register(ac, { signal, abort }, abort);
        }
      }
      this.#headers = new Headers(kConstruct);
      setHeadersList(this.#headers, request2.headersList);
      setHeadersGuard(this.#headers, "request");
      if (mode === "no-cors") {
        if (!corsSafeListedMethodsSet.has(request2.method)) {
          throw new TypeError(
            `'${request2.method} is unsupported in no-cors mode.`
          );
        }
        setHeadersGuard(this.#headers, "request-no-cors");
      }
      if (initHasKey) {
        const headersList = getHeadersList(this.#headers);
        const headers = init.headers !== void 0 ? init.headers : new HeadersList(headersList);
        headersList.clear();
        if (headers instanceof HeadersList) {
          for (const { name, value } of headers.rawValues()) {
            headersList.append(name, value, false);
          }
          headersList.cookies = headers.cookies;
        } else {
          fillHeaders(this.#headers, headers);
        }
      }
      const inputBody = webidl.is.Request(input) ? input.#state.body : null;
      if ((init.body != null || inputBody != null) && (request2.method === "GET" || request2.method === "HEAD")) {
        throw new TypeError("Request with GET/HEAD method cannot have body.");
      }
      let initBody = null;
      if (init.body != null) {
        const [extractedBody, contentType] = extractBody(
          init.body,
          request2.keepalive
        );
        initBody = extractedBody;
        if (contentType && !getHeadersList(this.#headers).contains("content-type", true)) {
          this.#headers.append("content-type", contentType, true);
        }
      }
      const inputOrInitBody = initBody ?? inputBody;
      if (inputOrInitBody != null && inputOrInitBody.source == null) {
        if (initBody != null && init.duplex == null) {
          throw new TypeError("RequestInit: duplex option is required when sending a body.");
        }
        if (request2.mode !== "same-origin" && request2.mode !== "cors") {
          throw new TypeError(
            'If request is made from ReadableStream, mode should be "same-origin" or "cors"'
          );
        }
        request2.useCORSPreflightFlag = true;
      }
      let finalBody = inputOrInitBody;
      if (initBody == null && inputBody != null) {
        if (bodyUnusable(input.#state)) {
          throw new TypeError(
            "Cannot construct a Request with a Request object that has already been used."
          );
        }
        const identityTransform = new TransformStream();
        inputBody.stream.pipeThrough(identityTransform);
        finalBody = {
          source: inputBody.source,
          length: inputBody.length,
          stream: identityTransform.readable
        };
      }
      this.#state.body = finalBody;
    }
    // Returns request’s HTTP method, which is "GET" by default.
    get method() {
      webidl.brandCheck(this, Request);
      return this.#state.method;
    }
    // Returns the URL of request as a string.
    get url() {
      webidl.brandCheck(this, Request);
      return URLSerializer(this.#state.url);
    }
    // Returns a Headers object consisting of the headers associated with request.
    // Note that headers added in the network layer by the user agent will not
    // be accounted for in this object, e.g., the "Host" header.
    get headers() {
      webidl.brandCheck(this, Request);
      return this.#headers;
    }
    // Returns the kind of resource requested by request, e.g., "document"
    // or "script".
    get destination() {
      webidl.brandCheck(this, Request);
      return this.#state.destination;
    }
    // Returns the referrer of request. Its value can be a same-origin URL if
    // explicitly set in init, the empty string to indicate no referrer, and
    // "about:client" when defaulting to the global’s default. This is used
    // during fetching to determine the value of the `Referer` header of the
    // request being made.
    get referrer() {
      webidl.brandCheck(this, Request);
      if (this.#state.referrer === "no-referrer") {
        return "";
      }
      if (this.#state.referrer === "client") {
        return "about:client";
      }
      return this.#state.referrer.toString();
    }
    // Returns the referrer policy associated with request.
    // This is used during fetching to compute the value of the request’s
    // referrer.
    get referrerPolicy() {
      webidl.brandCheck(this, Request);
      return this.#state.referrerPolicy;
    }
    // Returns the mode associated with request, which is a string indicating
    // whether the request will use CORS, or will be restricted to same-origin
    // URLs.
    get mode() {
      webidl.brandCheck(this, Request);
      return this.#state.mode;
    }
    // Returns the credentials mode associated with request,
    // which is a string indicating whether credentials will be sent with the
    // request always, never, or only when sent to a same-origin URL.
    get credentials() {
      webidl.brandCheck(this, Request);
      return this.#state.credentials;
    }
    // Returns the cache mode associated with request,
    // which is a string indicating how the request will
    // interact with the browser’s cache when fetching.
    get cache() {
      webidl.brandCheck(this, Request);
      return this.#state.cache;
    }
    // Returns the redirect mode associated with request,
    // which is a string indicating how redirects for the
    // request will be handled during fetching. A request
    // will follow redirects by default.
    get redirect() {
      webidl.brandCheck(this, Request);
      return this.#state.redirect;
    }
    // Returns request’s subresource integrity metadata, which is a
    // cryptographic hash of the resource being fetched. Its value
    // consists of multiple hashes separated by whitespace. [SRI]
    get integrity() {
      webidl.brandCheck(this, Request);
      return this.#state.integrity;
    }
    // Returns a boolean indicating whether or not request can outlive the
    // global in which it was created.
    get keepalive() {
      webidl.brandCheck(this, Request);
      return this.#state.keepalive;
    }
    // Returns a boolean indicating whether or not request is for a reload
    // navigation.
    get isReloadNavigation() {
      webidl.brandCheck(this, Request);
      return this.#state.reloadNavigation;
    }
    // Returns a boolean indicating whether or not request is for a history
    // navigation (a.k.a. back-forward navigation).
    get isHistoryNavigation() {
      webidl.brandCheck(this, Request);
      return this.#state.historyNavigation;
    }
    // Returns the signal associated with request, which is an AbortSignal
    // object indicating whether or not request has been aborted, and its
    // abort event handler.
    get signal() {
      webidl.brandCheck(this, Request);
      return this.#signal;
    }
    get body() {
      webidl.brandCheck(this, Request);
      return this.#state.body ? this.#state.body.stream : null;
    }
    get bodyUsed() {
      webidl.brandCheck(this, Request);
      return !!this.#state.body && util.isDisturbed(this.#state.body.stream);
    }
    get duplex() {
      webidl.brandCheck(this, Request);
      return "half";
    }
    // Returns a clone of request.
    clone() {
      webidl.brandCheck(this, Request);
      if (bodyUnusable(this.#state)) {
        throw new TypeError("unusable");
      }
      const clonedRequest = cloneRequest(this.#state);
      const ac = new AbortController();
      if (this.signal.aborted) {
        ac.abort(this.signal.reason);
      } else {
        let list = dependentControllerMap.get(this.signal);
        if (list === void 0) {
          list = /* @__PURE__ */ new Set();
          dependentControllerMap.set(this.signal, list);
        }
        const acRef = new WeakRef(ac);
        list.add(acRef);
        util.addAbortListener(
          ac.signal,
          buildAbort(acRef)
        );
      }
      return fromInnerRequest(clonedRequest, this.#dispatcher, ac.signal, getHeadersGuard(this.#headers));
    }
    [nodeUtil.inspect.custom](depth, options) {
      if (options.depth === null) {
        options.depth = 2;
      }
      options.colors ??= true;
      const properties = {
        method: this.method,
        url: this.url,
        headers: this.headers,
        destination: this.destination,
        referrer: this.referrer,
        referrerPolicy: this.referrerPolicy,
        mode: this.mode,
        credentials: this.credentials,
        cache: this.cache,
        redirect: this.redirect,
        integrity: this.integrity,
        keepalive: this.keepalive,
        isReloadNavigation: this.isReloadNavigation,
        isHistoryNavigation: this.isHistoryNavigation,
        signal: this.signal
      };
      return `Request ${nodeUtil.formatWithOptions(options, properties)}`;
    }
    /**
     * @param {Request} request
     * @param {AbortSignal} newSignal
     */
    static setRequestSignal(request2, newSignal) {
      request2.#signal = newSignal;
      return request2;
    }
    /**
     * @param {Request} request
     */
    static getRequestDispatcher(request2) {
      return request2.#dispatcher;
    }
    /**
     * @param {Request} request
     * @param {import('../../dispatcher/dispatcher')} newDispatcher
     */
    static setRequestDispatcher(request2, newDispatcher) {
      request2.#dispatcher = newDispatcher;
    }
    /**
     * @param {Request} request
     * @param {Headers} newHeaders
     */
    static setRequestHeaders(request2, newHeaders) {
      request2.#headers = newHeaders;
    }
    /**
     * @param {Request} request
     */
    static getRequestState(request2) {
      return request2.#state;
    }
    /**
     * @param {Request} request
     * @param {any} newState
     */
    static setRequestState(request2, newState) {
      request2.#state = newState;
    }
  }
  const { setRequestSignal, getRequestDispatcher, setRequestDispatcher, setRequestHeaders, getRequestState, setRequestState } = Request;
  Reflect.deleteProperty(Request, "setRequestSignal");
  Reflect.deleteProperty(Request, "getRequestDispatcher");
  Reflect.deleteProperty(Request, "setRequestDispatcher");
  Reflect.deleteProperty(Request, "setRequestHeaders");
  Reflect.deleteProperty(Request, "getRequestState");
  Reflect.deleteProperty(Request, "setRequestState");
  mixinBody(Request, getRequestState);
  function makeRequest(init) {
    return {
      method: init.method ?? "GET",
      localURLsOnly: init.localURLsOnly ?? false,
      unsafeRequest: init.unsafeRequest ?? false,
      body: init.body ?? null,
      client: init.client ?? null,
      reservedClient: init.reservedClient ?? null,
      replacesClientId: init.replacesClientId ?? "",
      window: init.window ?? "client",
      keepalive: init.keepalive ?? false,
      serviceWorkers: init.serviceWorkers ?? "all",
      initiator: init.initiator ?? "",
      destination: init.destination ?? "",
      priority: init.priority ?? null,
      origin: init.origin ?? "client",
      policyContainer: init.policyContainer ?? "client",
      referrer: init.referrer ?? "client",
      referrerPolicy: init.referrerPolicy ?? "",
      mode: init.mode ?? "no-cors",
      useCORSPreflightFlag: init.useCORSPreflightFlag ?? false,
      credentials: init.credentials ?? "same-origin",
      useCredentials: init.useCredentials ?? false,
      cache: init.cache ?? "default",
      redirect: init.redirect ?? "follow",
      integrity: init.integrity ?? "",
      cryptoGraphicsNonceMetadata: init.cryptoGraphicsNonceMetadata ?? "",
      parserMetadata: init.parserMetadata ?? "",
      reloadNavigation: init.reloadNavigation ?? false,
      historyNavigation: init.historyNavigation ?? false,
      userActivation: init.userActivation ?? false,
      taintedOrigin: init.taintedOrigin ?? false,
      redirectCount: init.redirectCount ?? 0,
      responseTainting: init.responseTainting ?? "basic",
      preventNoCacheCacheControlHeaderModification: init.preventNoCacheCacheControlHeaderModification ?? false,
      done: init.done ?? false,
      timingAllowFailed: init.timingAllowFailed ?? false,
      urlList: init.urlList,
      url: init.urlList[0],
      headersList: init.headersList ? new HeadersList(init.headersList) : new HeadersList()
    };
  }
  function cloneRequest(request2) {
    const newRequest = makeRequest({ ...request2, body: null });
    if (request2.body != null) {
      newRequest.body = cloneBody(request2.body);
    }
    return newRequest;
  }
  function fromInnerRequest(innerRequest, dispatcher, signal, guard) {
    const request2 = new Request(kConstruct);
    setRequestState(request2, innerRequest);
    setRequestDispatcher(request2, dispatcher);
    setRequestSignal(request2, signal);
    const headers = new Headers(kConstruct);
    setRequestHeaders(request2, headers);
    setHeadersList(headers, innerRequest.headersList);
    setHeadersGuard(headers, guard);
    return request2;
  }
  Object.defineProperties(Request.prototype, {
    method: kEnumerableProperty,
    url: kEnumerableProperty,
    headers: kEnumerableProperty,
    redirect: kEnumerableProperty,
    clone: kEnumerableProperty,
    signal: kEnumerableProperty,
    duplex: kEnumerableProperty,
    destination: kEnumerableProperty,
    body: kEnumerableProperty,
    bodyUsed: kEnumerableProperty,
    isHistoryNavigation: kEnumerableProperty,
    isReloadNavigation: kEnumerableProperty,
    keepalive: kEnumerableProperty,
    integrity: kEnumerableProperty,
    cache: kEnumerableProperty,
    credentials: kEnumerableProperty,
    attribute: kEnumerableProperty,
    referrerPolicy: kEnumerableProperty,
    referrer: kEnumerableProperty,
    mode: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "Request",
      configurable: true
    }
  });
  webidl.is.Request = webidl.util.MakeTypeAssertion(Request);
  webidl.converters.RequestInfo = function(V) {
    if (typeof V === "string") {
      return webidl.converters.USVString(V);
    }
    if (webidl.is.Request(V)) {
      return V;
    }
    return webidl.converters.USVString(V);
  };
  webidl.converters.RequestInit = webidl.dictionaryConverter([
    {
      key: "method",
      converter: webidl.converters.ByteString
    },
    {
      key: "headers",
      converter: webidl.converters.HeadersInit
    },
    {
      key: "body",
      converter: webidl.nullableConverter(
        webidl.converters.BodyInit
      )
    },
    {
      key: "referrer",
      converter: webidl.converters.USVString
    },
    {
      key: "referrerPolicy",
      converter: webidl.converters.DOMString,
      // https://w3c.github.io/webappsec-referrer-policy/#referrer-policy
      allowedValues: referrerPolicy
    },
    {
      key: "mode",
      converter: webidl.converters.DOMString,
      // https://fetch.spec.whatwg.org/#concept-request-mode
      allowedValues: requestMode
    },
    {
      key: "credentials",
      converter: webidl.converters.DOMString,
      // https://fetch.spec.whatwg.org/#requestcredentials
      allowedValues: requestCredentials
    },
    {
      key: "cache",
      converter: webidl.converters.DOMString,
      // https://fetch.spec.whatwg.org/#requestcache
      allowedValues: requestCache
    },
    {
      key: "redirect",
      converter: webidl.converters.DOMString,
      // https://fetch.spec.whatwg.org/#requestredirect
      allowedValues: requestRedirect
    },
    {
      key: "integrity",
      converter: webidl.converters.DOMString
    },
    {
      key: "keepalive",
      converter: webidl.converters.boolean
    },
    {
      key: "signal",
      converter: webidl.nullableConverter(
        (signal) => webidl.converters.AbortSignal(
          signal,
          "RequestInit",
          "signal"
        )
      )
    },
    {
      key: "window",
      converter: webidl.converters.any
    },
    {
      key: "duplex",
      converter: webidl.converters.DOMString,
      allowedValues: requestDuplex
    },
    {
      key: "dispatcher",
      // undici specific option
      converter: webidl.converters.any
    }
  ]);
  request = {
    Request,
    makeRequest,
    fromInnerRequest,
    cloneRequest,
    getRequestDispatcher,
    getRequestState
  };
  return request;
}
export {
  requireRequest as __require
};
//# sourceMappingURL=index49.js.map
