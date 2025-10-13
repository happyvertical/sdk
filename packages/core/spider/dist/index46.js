import { __require as requireResponse } from "./index48.js";
import { __require as requireHeaders } from "./index47.js";
import { __require as requireRequest } from "./index49.js";
import require$$0$1 from "node:zlib";
import { __require as requireUtil } from "./index88.js";
import require$$0$2 from "node:assert";
import { __require as requireBody } from "./index89.js";
import { __require as requireConstants } from "./index90.js";
import require$$6 from "node:events";
import require$$0 from "node:stream";
import { __require as requireUtil$1 } from "./index24.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireGlobal } from "./index34.js";
import { __require as requireWebidl } from "./index91.js";
import require$$2 from "node:http";
import { __require as requireSubresourceIntegrity } from "./index92.js";
import { __require as requirePromise } from "./index93.js";
import require$$0$3 from "node:buffer";
var fetch_1;
var hasRequiredFetch;
function requireFetch() {
  if (hasRequiredFetch) return fetch_1;
  hasRequiredFetch = 1;
  const {
    makeNetworkError,
    makeAppropriateNetworkError,
    filterResponse,
    makeResponse,
    fromInnerResponse,
    getResponseState
  } = requireResponse();
  const { HeadersList } = requireHeaders();
  const { Request, cloneRequest, getRequestDispatcher, getRequestState } = requireRequest();
  const zlib = require$$0$1;
  const {
    makePolicyContainer,
    clonePolicyContainer,
    requestBadPort,
    TAOCheck,
    appendRequestOriginHeader,
    responseLocationURL,
    requestCurrentURL,
    setRequestReferrerPolicyOnRedirect,
    tryUpgradeRequestToAPotentiallyTrustworthyURL,
    createOpaqueTimingInfo,
    appendFetchMetadata,
    corsCheck,
    crossOriginResourcePolicyCheck,
    determineRequestsReferrer,
    coarsenedSharedCurrentTime,
    sameOrigin,
    isCancelled,
    isAborted,
    isErrorLike,
    fullyReadBody,
    readableStreamClose,
    isomorphicEncode,
    urlIsLocal,
    urlIsHttpHttpsScheme,
    urlHasHttpsScheme,
    clampAndCoarsenConnectionTimingInfo,
    simpleRangeHeaderValue,
    buildContentRange,
    createInflate,
    extractMimeType
  } = requireUtil();
  const assert = require$$0$2;
  const { safelyExtractBody, extractBody } = requireBody();
  const {
    redirectStatusSet,
    nullBodyStatus,
    safeMethodsSet,
    requestBodyHeader,
    subresourceSet
  } = requireConstants();
  const EE = require$$6;
  const { Readable, pipeline, finished, isErrored, isReadable } = require$$0;
  const { addAbortListener, bufferToLowerCasedHeaderName } = requireUtil$1();
  const { dataURLProcessor, serializeAMimeType, minimizeSupportedMimeType } = requireDataUrl();
  const { getGlobalDispatcher } = requireGlobal();
  const { webidl } = requireWebidl();
  const { STATUS_CODES } = require$$2;
  const { bytesMatch } = requireSubresourceIntegrity();
  const { createDeferredPromise } = requirePromise();
  const hasZstd = typeof zlib.createZstdDecompress === "function";
  const GET_OR_HEAD = ["GET", "HEAD"];
  const defaultUserAgent = typeof __UNDICI_IS_NODE__ !== "undefined" || typeof esbuildDetection !== "undefined" ? "node" : "undici";
  let resolveObjectURL;
  class Fetch extends EE {
    constructor(dispatcher) {
      super();
      this.dispatcher = dispatcher;
      this.connection = null;
      this.dump = false;
      this.state = "ongoing";
    }
    terminate(reason) {
      if (this.state !== "ongoing") {
        return;
      }
      this.state = "terminated";
      this.connection?.destroy(reason);
      this.emit("terminated", reason);
    }
    // https://fetch.spec.whatwg.org/#fetch-controller-abort
    abort(error) {
      if (this.state !== "ongoing") {
        return;
      }
      this.state = "aborted";
      if (!error) {
        error = new DOMException("The operation was aborted.", "AbortError");
      }
      this.serializedAbortReason = error;
      this.connection?.destroy(error);
      this.emit("terminated", error);
    }
  }
  function handleFetchDone(response) {
    finalizeAndReportTiming(response, "fetch");
  }
  function fetch(input, init = void 0) {
    webidl.argumentLengthCheck(arguments, 1, "globalThis.fetch");
    let p = createDeferredPromise();
    let requestObject;
    try {
      requestObject = new Request(input, init);
    } catch (e) {
      p.reject(e);
      return p.promise;
    }
    const request = getRequestState(requestObject);
    if (requestObject.signal.aborted) {
      abortFetch(p, request, null, requestObject.signal.reason);
      return p.promise;
    }
    const globalObject = request.client.globalObject;
    if (globalObject?.constructor?.name === "ServiceWorkerGlobalScope") {
      request.serviceWorkers = "none";
    }
    let responseObject = null;
    let locallyAborted = false;
    let controller = null;
    addAbortListener(
      requestObject.signal,
      () => {
        locallyAborted = true;
        assert(controller != null);
        controller.abort(requestObject.signal.reason);
        const realResponse = responseObject?.deref();
        abortFetch(p, request, realResponse, requestObject.signal.reason);
      }
    );
    const processResponse = (response) => {
      if (locallyAborted) {
        return;
      }
      if (response.aborted) {
        abortFetch(p, request, responseObject, controller.serializedAbortReason);
        return;
      }
      if (response.type === "error") {
        p.reject(new TypeError("fetch failed", { cause: response.error }));
        return;
      }
      responseObject = new WeakRef(fromInnerResponse(response, "immutable"));
      p.resolve(responseObject.deref());
      p = null;
    };
    controller = fetching({
      request,
      processResponseEndOfBody: handleFetchDone,
      processResponse,
      dispatcher: getRequestDispatcher(requestObject)
      // undici
    });
    return p.promise;
  }
  function finalizeAndReportTiming(response, initiatorType = "other") {
    if (response.type === "error" && response.aborted) {
      return;
    }
    if (!response.urlList?.length) {
      return;
    }
    const originalURL = response.urlList[0];
    let timingInfo = response.timingInfo;
    let cacheState = response.cacheState;
    if (!urlIsHttpHttpsScheme(originalURL)) {
      return;
    }
    if (timingInfo === null) {
      return;
    }
    if (!response.timingAllowPassed) {
      timingInfo = createOpaqueTimingInfo({
        startTime: timingInfo.startTime
      });
      cacheState = "";
    }
    timingInfo.endTime = coarsenedSharedCurrentTime();
    response.timingInfo = timingInfo;
    markResourceTiming(
      timingInfo,
      originalURL.href,
      initiatorType,
      globalThis,
      cacheState,
      "",
      // bodyType
      response.status
    );
  }
  const markResourceTiming = performance.markResourceTiming;
  function abortFetch(p, request, responseObject, error) {
    if (p) {
      p.reject(error);
    }
    if (request.body?.stream != null && isReadable(request.body.stream)) {
      request.body.stream.cancel(error).catch((err) => {
        if (err.code === "ERR_INVALID_STATE") {
          return;
        }
        throw err;
      });
    }
    if (responseObject == null) {
      return;
    }
    const response = getResponseState(responseObject);
    if (response.body?.stream != null && isReadable(response.body.stream)) {
      response.body.stream.cancel(error).catch((err) => {
        if (err.code === "ERR_INVALID_STATE") {
          return;
        }
        throw err;
      });
    }
  }
  function fetching({
    request,
    processRequestBodyChunkLength,
    processRequestEndOfBody,
    processResponse,
    processResponseEndOfBody,
    processResponseConsumeBody,
    useParallelQueue = false,
    dispatcher = getGlobalDispatcher()
    // undici
  }) {
    assert(dispatcher);
    let taskDestination = null;
    let crossOriginIsolatedCapability = false;
    if (request.client != null) {
      taskDestination = request.client.globalObject;
      crossOriginIsolatedCapability = request.client.crossOriginIsolatedCapability;
    }
    const currentTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability);
    const timingInfo = createOpaqueTimingInfo({
      startTime: currentTime
    });
    const fetchParams = {
      controller: new Fetch(dispatcher),
      request,
      timingInfo,
      processRequestBodyChunkLength,
      processRequestEndOfBody,
      processResponse,
      processResponseConsumeBody,
      processResponseEndOfBody,
      taskDestination,
      crossOriginIsolatedCapability
    };
    assert(!request.body || request.body.stream);
    if (request.window === "client") {
      request.window = request.client?.globalObject?.constructor?.name === "Window" ? request.client : "no-window";
    }
    if (request.origin === "client") {
      request.origin = request.client.origin;
    }
    if (request.policyContainer === "client") {
      if (request.client != null) {
        request.policyContainer = clonePolicyContainer(
          request.client.policyContainer
        );
      } else {
        request.policyContainer = makePolicyContainer();
      }
    }
    if (!request.headersList.contains("accept", true)) {
      const value = "*/*";
      request.headersList.append("accept", value, true);
    }
    if (!request.headersList.contains("accept-language", true)) {
      request.headersList.append("accept-language", "*", true);
    }
    if (request.priority === null) ;
    if (subresourceSet.has(request.destination)) ;
    mainFetch(fetchParams, false);
    return fetchParams.controller;
  }
  async function mainFetch(fetchParams, recursive) {
    try {
      const request = fetchParams.request;
      let response = null;
      if (request.localURLsOnly && !urlIsLocal(requestCurrentURL(request))) {
        response = makeNetworkError("local URLs only");
      }
      tryUpgradeRequestToAPotentiallyTrustworthyURL(request);
      if (requestBadPort(request) === "blocked") {
        response = makeNetworkError("bad port");
      }
      if (request.referrerPolicy === "") {
        request.referrerPolicy = request.policyContainer.referrerPolicy;
      }
      if (request.referrer !== "no-referrer") {
        request.referrer = determineRequestsReferrer(request);
      }
      if (response === null) {
        const currentURL = requestCurrentURL(request);
        if (
          // - request’s current URL’s origin is same origin with request’s origin,
          //   and request’s response tainting is "basic"
          sameOrigin(currentURL, request.url) && request.responseTainting === "basic" || // request’s current URL’s scheme is "data"
          currentURL.protocol === "data:" || // - request’s mode is "navigate" or "websocket"
          (request.mode === "navigate" || request.mode === "websocket")
        ) {
          request.responseTainting = "basic";
          response = await schemeFetch(fetchParams);
        } else if (request.mode === "same-origin") {
          response = makeNetworkError('request mode cannot be "same-origin"');
        } else if (request.mode === "no-cors") {
          if (request.redirect !== "follow") {
            response = makeNetworkError(
              'redirect mode cannot be "follow" for "no-cors" request'
            );
          } else {
            request.responseTainting = "opaque";
            response = await schemeFetch(fetchParams);
          }
        } else if (!urlIsHttpHttpsScheme(requestCurrentURL(request))) {
          response = makeNetworkError("URL scheme must be a HTTP(S) scheme");
        } else {
          request.responseTainting = "cors";
          response = await httpFetch(fetchParams);
        }
      }
      if (recursive) {
        return response;
      }
      if (response.status !== 0 && !response.internalResponse) {
        if (request.responseTainting === "cors") {
        }
        if (request.responseTainting === "basic") {
          response = filterResponse(response, "basic");
        } else if (request.responseTainting === "cors") {
          response = filterResponse(response, "cors");
        } else if (request.responseTainting === "opaque") {
          response = filterResponse(response, "opaque");
        } else {
          assert(false);
        }
      }
      let internalResponse = response.status === 0 ? response : response.internalResponse;
      if (internalResponse.urlList.length === 0) {
        internalResponse.urlList.push(...request.urlList);
      }
      if (!request.timingAllowFailed) {
        response.timingAllowPassed = true;
      }
      if (response.type === "opaque" && internalResponse.status === 206 && internalResponse.rangeRequested && !request.headers.contains("range", true)) {
        response = internalResponse = makeNetworkError();
      }
      if (response.status !== 0 && (request.method === "HEAD" || request.method === "CONNECT" || nullBodyStatus.includes(internalResponse.status))) {
        internalResponse.body = null;
        fetchParams.controller.dump = true;
      }
      if (request.integrity) {
        const processBodyError = (reason) => fetchFinale(fetchParams, makeNetworkError(reason));
        if (request.responseTainting === "opaque" || response.body == null) {
          processBodyError(response.error);
          return;
        }
        const processBody = (bytes) => {
          if (!bytesMatch(bytes, request.integrity)) {
            processBodyError("integrity mismatch");
            return;
          }
          response.body = safelyExtractBody(bytes)[0];
          fetchFinale(fetchParams, response);
        };
        fullyReadBody(response.body, processBody, processBodyError);
      } else {
        fetchFinale(fetchParams, response);
      }
    } catch (err) {
      fetchParams.controller.terminate(err);
    }
  }
  function schemeFetch(fetchParams) {
    if (isCancelled(fetchParams) && fetchParams.request.redirectCount === 0) {
      return Promise.resolve(makeAppropriateNetworkError(fetchParams));
    }
    const { request } = fetchParams;
    const { protocol: scheme } = requestCurrentURL(request);
    switch (scheme) {
      case "about:": {
        return Promise.resolve(makeNetworkError("about scheme is not supported"));
      }
      case "blob:": {
        if (!resolveObjectURL) {
          resolveObjectURL = require$$0$3.resolveObjectURL;
        }
        const blobURLEntry = requestCurrentURL(request);
        if (blobURLEntry.search.length !== 0) {
          return Promise.resolve(makeNetworkError("NetworkError when attempting to fetch resource."));
        }
        const blob = resolveObjectURL(blobURLEntry.toString());
        if (request.method !== "GET" || !webidl.is.Blob(blob)) {
          return Promise.resolve(makeNetworkError("invalid method"));
        }
        const response = makeResponse();
        const fullLength = blob.size;
        const serializedFullLength = isomorphicEncode(`${fullLength}`);
        const type = blob.type;
        if (!request.headersList.contains("range", true)) {
          const bodyWithType = extractBody(blob);
          response.statusText = "OK";
          response.body = bodyWithType[0];
          response.headersList.set("content-length", serializedFullLength, true);
          response.headersList.set("content-type", type, true);
        } else {
          response.rangeRequested = true;
          const rangeHeader = request.headersList.get("range", true);
          const rangeValue = simpleRangeHeaderValue(rangeHeader, true);
          if (rangeValue === "failure") {
            return Promise.resolve(makeNetworkError("failed to fetch the data URL"));
          }
          let { rangeStartValue: rangeStart, rangeEndValue: rangeEnd } = rangeValue;
          if (rangeStart === null) {
            rangeStart = fullLength - rangeEnd;
            rangeEnd = rangeStart + rangeEnd - 1;
          } else {
            if (rangeStart >= fullLength) {
              return Promise.resolve(makeNetworkError("Range start is greater than the blob's size."));
            }
            if (rangeEnd === null || rangeEnd >= fullLength) {
              rangeEnd = fullLength - 1;
            }
          }
          const slicedBlob = blob.slice(rangeStart, rangeEnd, type);
          const slicedBodyWithType = extractBody(slicedBlob);
          response.body = slicedBodyWithType[0];
          const serializedSlicedLength = isomorphicEncode(`${slicedBlob.size}`);
          const contentRange = buildContentRange(rangeStart, rangeEnd, fullLength);
          response.status = 206;
          response.statusText = "Partial Content";
          response.headersList.set("content-length", serializedSlicedLength, true);
          response.headersList.set("content-type", type, true);
          response.headersList.set("content-range", contentRange, true);
        }
        return Promise.resolve(response);
      }
      case "data:": {
        const currentURL = requestCurrentURL(request);
        const dataURLStruct = dataURLProcessor(currentURL);
        if (dataURLStruct === "failure") {
          return Promise.resolve(makeNetworkError("failed to fetch the data URL"));
        }
        const mimeType = serializeAMimeType(dataURLStruct.mimeType);
        return Promise.resolve(makeResponse({
          statusText: "OK",
          headersList: [
            ["content-type", { name: "Content-Type", value: mimeType }]
          ],
          body: safelyExtractBody(dataURLStruct.body)[0]
        }));
      }
      case "file:": {
        return Promise.resolve(makeNetworkError("not implemented... yet..."));
      }
      case "http:":
      case "https:": {
        return httpFetch(fetchParams).catch((err) => makeNetworkError(err));
      }
      default: {
        return Promise.resolve(makeNetworkError("unknown scheme"));
      }
    }
  }
  function finalizeResponse(fetchParams, response) {
    fetchParams.request.done = true;
    if (fetchParams.processResponseDone != null) {
      queueMicrotask(() => fetchParams.processResponseDone(response));
    }
  }
  function fetchFinale(fetchParams, response) {
    let timingInfo = fetchParams.timingInfo;
    const processResponseEndOfBody = () => {
      const unsafeEndTime = Date.now();
      if (fetchParams.request.destination === "document") {
        fetchParams.controller.fullTimingInfo = timingInfo;
      }
      fetchParams.controller.reportTimingSteps = () => {
        if (!urlIsHttpHttpsScheme(fetchParams.request.url)) {
          return;
        }
        timingInfo.endTime = unsafeEndTime;
        let cacheState = response.cacheState;
        const bodyInfo = response.bodyInfo;
        if (!response.timingAllowPassed) {
          timingInfo = createOpaqueTimingInfo(timingInfo);
          cacheState = "";
        }
        let responseStatus = 0;
        if (fetchParams.request.mode !== "navigator" || !response.hasCrossOriginRedirects) {
          responseStatus = response.status;
          const mimeType = extractMimeType(response.headersList);
          if (mimeType !== "failure") {
            bodyInfo.contentType = minimizeSupportedMimeType(mimeType);
          }
        }
        if (fetchParams.request.initiatorType != null) {
          markResourceTiming(timingInfo, fetchParams.request.url.href, fetchParams.request.initiatorType, globalThis, cacheState, bodyInfo, responseStatus);
        }
      };
      const processResponseEndOfBodyTask = () => {
        fetchParams.request.done = true;
        if (fetchParams.processResponseEndOfBody != null) {
          queueMicrotask(() => fetchParams.processResponseEndOfBody(response));
        }
        if (fetchParams.request.initiatorType != null) {
          fetchParams.controller.reportTimingSteps();
        }
      };
      queueMicrotask(() => processResponseEndOfBodyTask());
    };
    if (fetchParams.processResponse != null) {
      queueMicrotask(() => {
        fetchParams.processResponse(response);
        fetchParams.processResponse = null;
      });
    }
    const internalResponse = response.type === "error" ? response : response.internalResponse ?? response;
    if (internalResponse.body == null) {
      processResponseEndOfBody();
    } else {
      finished(internalResponse.body.stream, () => {
        processResponseEndOfBody();
      });
    }
  }
  async function httpFetch(fetchParams) {
    const request = fetchParams.request;
    let response = null;
    let actualResponse = null;
    const timingInfo = fetchParams.timingInfo;
    if (request.serviceWorkers === "all") ;
    if (response === null) {
      if (request.redirect === "follow") {
        request.serviceWorkers = "none";
      }
      actualResponse = response = await httpNetworkOrCacheFetch(fetchParams);
      if (request.responseTainting === "cors" && corsCheck(request, response) === "failure") {
        return makeNetworkError("cors failure");
      }
      if (TAOCheck(request, response) === "failure") {
        request.timingAllowFailed = true;
      }
    }
    if ((request.responseTainting === "opaque" || response.type === "opaque") && crossOriginResourcePolicyCheck(
      request.origin,
      request.client,
      request.destination,
      actualResponse
    ) === "blocked") {
      return makeNetworkError("blocked");
    }
    if (redirectStatusSet.has(actualResponse.status)) {
      if (request.redirect !== "manual") {
        fetchParams.controller.connection.destroy(void 0, false);
      }
      if (request.redirect === "error") {
        response = makeNetworkError("unexpected redirect");
      } else if (request.redirect === "manual") {
        response = actualResponse;
      } else if (request.redirect === "follow") {
        response = await httpRedirectFetch(fetchParams, response);
      } else {
        assert(false);
      }
    }
    response.timingInfo = timingInfo;
    return response;
  }
  function httpRedirectFetch(fetchParams, response) {
    const request = fetchParams.request;
    const actualResponse = response.internalResponse ? response.internalResponse : response;
    let locationURL;
    try {
      locationURL = responseLocationURL(
        actualResponse,
        requestCurrentURL(request).hash
      );
      if (locationURL == null) {
        return response;
      }
    } catch (err) {
      return Promise.resolve(makeNetworkError(err));
    }
    if (!urlIsHttpHttpsScheme(locationURL)) {
      return Promise.resolve(makeNetworkError("URL scheme must be a HTTP(S) scheme"));
    }
    if (request.redirectCount === 20) {
      return Promise.resolve(makeNetworkError("redirect count exceeded"));
    }
    request.redirectCount += 1;
    if (request.mode === "cors" && (locationURL.username || locationURL.password) && !sameOrigin(request, locationURL)) {
      return Promise.resolve(makeNetworkError('cross origin not allowed for request mode "cors"'));
    }
    if (request.responseTainting === "cors" && (locationURL.username || locationURL.password)) {
      return Promise.resolve(makeNetworkError(
        'URL cannot contain credentials for request mode "cors"'
      ));
    }
    if (actualResponse.status !== 303 && request.body != null && request.body.source == null) {
      return Promise.resolve(makeNetworkError());
    }
    if ([301, 302].includes(actualResponse.status) && request.method === "POST" || actualResponse.status === 303 && !GET_OR_HEAD.includes(request.method)) {
      request.method = "GET";
      request.body = null;
      for (const headerName of requestBodyHeader) {
        request.headersList.delete(headerName);
      }
    }
    if (!sameOrigin(requestCurrentURL(request), locationURL)) {
      request.headersList.delete("authorization", true);
      request.headersList.delete("proxy-authorization", true);
      request.headersList.delete("cookie", true);
      request.headersList.delete("host", true);
    }
    if (request.body != null) {
      assert(request.body.source != null);
      request.body = safelyExtractBody(request.body.source)[0];
    }
    const timingInfo = fetchParams.timingInfo;
    timingInfo.redirectEndTime = timingInfo.postRedirectStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
    if (timingInfo.redirectStartTime === 0) {
      timingInfo.redirectStartTime = timingInfo.startTime;
    }
    request.urlList.push(locationURL);
    setRequestReferrerPolicyOnRedirect(request, actualResponse);
    return mainFetch(fetchParams, true);
  }
  async function httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch = false, isNewConnectionFetch = false) {
    const request = fetchParams.request;
    let httpFetchParams = null;
    let httpRequest = null;
    let response = null;
    if (request.window === "no-window" && request.redirect === "error") {
      httpFetchParams = fetchParams;
      httpRequest = request;
    } else {
      httpRequest = cloneRequest(request);
      httpFetchParams = { ...fetchParams };
      httpFetchParams.request = httpRequest;
    }
    const includeCredentials = request.credentials === "include" || request.credentials === "same-origin" && request.responseTainting === "basic";
    const contentLength = httpRequest.body ? httpRequest.body.length : null;
    let contentLengthHeaderValue = null;
    if (httpRequest.body == null && ["POST", "PUT"].includes(httpRequest.method)) {
      contentLengthHeaderValue = "0";
    }
    if (contentLength != null) {
      contentLengthHeaderValue = isomorphicEncode(`${contentLength}`);
    }
    if (contentLengthHeaderValue != null) {
      httpRequest.headersList.append("content-length", contentLengthHeaderValue, true);
    }
    if (contentLength != null && httpRequest.keepalive) ;
    if (webidl.is.URL(httpRequest.referrer)) {
      httpRequest.headersList.append("referer", isomorphicEncode(httpRequest.referrer.href), true);
    }
    appendRequestOriginHeader(httpRequest);
    appendFetchMetadata(httpRequest);
    if (!httpRequest.headersList.contains("user-agent", true)) {
      httpRequest.headersList.append("user-agent", defaultUserAgent, true);
    }
    if (httpRequest.cache === "default" && (httpRequest.headersList.contains("if-modified-since", true) || httpRequest.headersList.contains("if-none-match", true) || httpRequest.headersList.contains("if-unmodified-since", true) || httpRequest.headersList.contains("if-match", true) || httpRequest.headersList.contains("if-range", true))) {
      httpRequest.cache = "no-store";
    }
    if (httpRequest.cache === "no-cache" && !httpRequest.preventNoCacheCacheControlHeaderModification && !httpRequest.headersList.contains("cache-control", true)) {
      httpRequest.headersList.append("cache-control", "max-age=0", true);
    }
    if (httpRequest.cache === "no-store" || httpRequest.cache === "reload") {
      if (!httpRequest.headersList.contains("pragma", true)) {
        httpRequest.headersList.append("pragma", "no-cache", true);
      }
      if (!httpRequest.headersList.contains("cache-control", true)) {
        httpRequest.headersList.append("cache-control", "no-cache", true);
      }
    }
    if (httpRequest.headersList.contains("range", true)) {
      httpRequest.headersList.append("accept-encoding", "identity", true);
    }
    if (!httpRequest.headersList.contains("accept-encoding", true)) {
      if (urlHasHttpsScheme(requestCurrentURL(httpRequest))) {
        httpRequest.headersList.append("accept-encoding", "br, gzip, deflate", true);
      } else {
        httpRequest.headersList.append("accept-encoding", "gzip, deflate", true);
      }
    }
    httpRequest.headersList.delete("host", true);
    {
      httpRequest.cache = "no-store";
    }
    if (httpRequest.cache !== "no-store" && httpRequest.cache !== "reload") ;
    if (response == null) {
      if (httpRequest.cache === "only-if-cached") {
        return makeNetworkError("only if cached");
      }
      const forwardResponse = await httpNetworkFetch(
        httpFetchParams,
        includeCredentials,
        isNewConnectionFetch
      );
      if (!safeMethodsSet.has(httpRequest.method) && forwardResponse.status >= 200 && forwardResponse.status <= 399) ;
      if (response == null) {
        response = forwardResponse;
      }
    }
    response.urlList = [...httpRequest.urlList];
    if (httpRequest.headersList.contains("range", true)) {
      response.rangeRequested = true;
    }
    response.requestIncludesCredentials = includeCredentials;
    if (response.status === 407) {
      if (request.window === "no-window") {
        return makeNetworkError();
      }
      if (isCancelled(fetchParams)) {
        return makeAppropriateNetworkError(fetchParams);
      }
      return makeNetworkError("proxy authentication required");
    }
    if (
      // response’s status is 421
      response.status === 421 && // isNewConnectionFetch is false
      !isNewConnectionFetch && // request’s body is null, or request’s body is non-null and request’s body’s source is non-null
      (request.body == null || request.body.source != null)
    ) {
      if (isCancelled(fetchParams)) {
        return makeAppropriateNetworkError(fetchParams);
      }
      fetchParams.controller.connection.destroy();
      response = await httpNetworkOrCacheFetch(
        fetchParams,
        isAuthenticationFetch,
        true
      );
    }
    return response;
  }
  async function httpNetworkFetch(fetchParams, includeCredentials = false, forceNewConnection = false) {
    assert(!fetchParams.controller.connection || fetchParams.controller.connection.destroyed);
    fetchParams.controller.connection = {
      abort: null,
      destroyed: false,
      destroy(err, abort = true) {
        if (!this.destroyed) {
          this.destroyed = true;
          if (abort) {
            this.abort?.(err ?? new DOMException("The operation was aborted.", "AbortError"));
          }
        }
      }
    };
    const request = fetchParams.request;
    let response = null;
    const timingInfo = fetchParams.timingInfo;
    {
      request.cache = "no-store";
    }
    if (request.mode === "websocket") ;
    let requestBody = null;
    if (request.body == null && fetchParams.processRequestEndOfBody) {
      queueMicrotask(() => fetchParams.processRequestEndOfBody());
    } else if (request.body != null) {
      const processBodyChunk = async function* (bytes) {
        if (isCancelled(fetchParams)) {
          return;
        }
        yield bytes;
        fetchParams.processRequestBodyChunkLength?.(bytes.byteLength);
      };
      const processEndOfBody = () => {
        if (isCancelled(fetchParams)) {
          return;
        }
        if (fetchParams.processRequestEndOfBody) {
          fetchParams.processRequestEndOfBody();
        }
      };
      const processBodyError = (e) => {
        if (isCancelled(fetchParams)) {
          return;
        }
        if (e.name === "AbortError") {
          fetchParams.controller.abort();
        } else {
          fetchParams.controller.terminate(e);
        }
      };
      requestBody = (async function* () {
        try {
          for await (const bytes of request.body.stream) {
            yield* processBodyChunk(bytes);
          }
          processEndOfBody();
        } catch (err) {
          processBodyError(err);
        }
      })();
    }
    try {
      const { body, status, statusText, headersList, socket } = await dispatch({ body: requestBody });
      if (socket) {
        response = makeResponse({ status, statusText, headersList, socket });
      } else {
        const iterator = body[Symbol.asyncIterator]();
        fetchParams.controller.next = () => iterator.next();
        response = makeResponse({ status, statusText, headersList });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        fetchParams.controller.connection.destroy();
        return makeAppropriateNetworkError(fetchParams, err);
      }
      return makeNetworkError(err);
    }
    const pullAlgorithm = () => {
      return fetchParams.controller.resume();
    };
    const cancelAlgorithm = (reason) => {
      if (!isCancelled(fetchParams)) {
        fetchParams.controller.abort(reason);
      }
    };
    const stream = new ReadableStream(
      {
        start(controller) {
          fetchParams.controller.controller = controller;
        },
        pull: pullAlgorithm,
        cancel: cancelAlgorithm,
        type: "bytes"
      }
    );
    response.body = { stream, source: null, length: null };
    if (!fetchParams.controller.resume) {
      fetchParams.controller.on("terminated", onAborted);
    }
    fetchParams.controller.resume = async () => {
      while (true) {
        let bytes;
        let isFailure;
        try {
          const { done, value } = await fetchParams.controller.next();
          if (isAborted(fetchParams)) {
            break;
          }
          bytes = done ? void 0 : value;
        } catch (err) {
          if (fetchParams.controller.ended && !timingInfo.encodedBodySize) {
            bytes = void 0;
          } else {
            bytes = err;
            isFailure = true;
          }
        }
        if (bytes === void 0) {
          readableStreamClose(fetchParams.controller.controller);
          finalizeResponse(fetchParams, response);
          return;
        }
        timingInfo.decodedBodySize += bytes?.byteLength ?? 0;
        if (isFailure) {
          fetchParams.controller.terminate(bytes);
          return;
        }
        const buffer = new Uint8Array(bytes);
        if (buffer.byteLength) {
          fetchParams.controller.controller.enqueue(buffer);
        }
        if (isErrored(stream)) {
          fetchParams.controller.terminate();
          return;
        }
        if (fetchParams.controller.controller.desiredSize <= 0) {
          return;
        }
      }
    };
    function onAborted(reason) {
      if (isAborted(fetchParams)) {
        response.aborted = true;
        if (isReadable(stream)) {
          fetchParams.controller.controller.error(
            fetchParams.controller.serializedAbortReason
          );
        }
      } else {
        if (isReadable(stream)) {
          fetchParams.controller.controller.error(new TypeError("terminated", {
            cause: isErrorLike(reason) ? reason : void 0
          }));
        }
      }
      fetchParams.controller.connection.destroy();
    }
    return response;
    function dispatch({ body }) {
      const url = requestCurrentURL(request);
      const agent = fetchParams.controller.dispatcher;
      return new Promise((resolve, reject) => agent.dispatch(
        {
          path: url.pathname + url.search,
          origin: url.origin,
          method: request.method,
          body: agent.isMockActive ? request.body && (request.body.source || request.body.stream) : body,
          headers: request.headersList.entries,
          maxRedirections: 0,
          upgrade: request.mode === "websocket" ? "websocket" : void 0
        },
        {
          body: null,
          abort: null,
          onConnect(abort) {
            const { connection } = fetchParams.controller;
            timingInfo.finalConnectionTimingInfo = clampAndCoarsenConnectionTimingInfo(void 0, timingInfo.postRedirectStartTime, fetchParams.crossOriginIsolatedCapability);
            if (connection.destroyed) {
              abort(new DOMException("The operation was aborted.", "AbortError"));
            } else {
              fetchParams.controller.on("terminated", abort);
              this.abort = connection.abort = abort;
            }
            timingInfo.finalNetworkRequestStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
          },
          onResponseStarted() {
            timingInfo.finalNetworkResponseStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
          },
          onHeaders(status, rawHeaders, resume, statusText) {
            if (status < 200) {
              return false;
            }
            const headersList = new HeadersList();
            for (let i = 0; i < rawHeaders.length; i += 2) {
              headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString("latin1"), true);
            }
            const location = headersList.get("location", true);
            this.body = new Readable({ read: resume });
            const willFollow = location && request.redirect === "follow" && redirectStatusSet.has(status);
            const decoders = [];
            if (request.method !== "HEAD" && request.method !== "CONNECT" && !nullBodyStatus.includes(status) && !willFollow) {
              const contentEncoding = headersList.get("content-encoding", true);
              const codings = contentEncoding ? contentEncoding.toLowerCase().split(",") : [];
              for (let i = codings.length - 1; i >= 0; --i) {
                const coding = codings[i].trim();
                if (coding === "x-gzip" || coding === "gzip") {
                  decoders.push(zlib.createGunzip({
                    // Be less strict when decoding compressed responses, since sometimes
                    // servers send slightly invalid responses that are still accepted
                    // by common browsers.
                    // Always using Z_SYNC_FLUSH is what cURL does.
                    flush: zlib.constants.Z_SYNC_FLUSH,
                    finishFlush: zlib.constants.Z_SYNC_FLUSH
                  }));
                } else if (coding === "deflate") {
                  decoders.push(createInflate({
                    flush: zlib.constants.Z_SYNC_FLUSH,
                    finishFlush: zlib.constants.Z_SYNC_FLUSH
                  }));
                } else if (coding === "br") {
                  decoders.push(zlib.createBrotliDecompress({
                    flush: zlib.constants.BROTLI_OPERATION_FLUSH,
                    finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
                  }));
                } else if (coding === "zstd" && hasZstd) {
                  decoders.push(zlib.createZstdDecompress({
                    flush: zlib.constants.ZSTD_e_continue,
                    finishFlush: zlib.constants.ZSTD_e_end
                  }));
                } else {
                  decoders.length = 0;
                  break;
                }
              }
            }
            const onError = this.onError.bind(this);
            resolve({
              status,
              statusText,
              headersList,
              body: decoders.length ? pipeline(this.body, ...decoders, (err) => {
                if (err) {
                  this.onError(err);
                }
              }).on("error", onError) : this.body.on("error", onError)
            });
            return true;
          },
          onData(chunk) {
            if (fetchParams.controller.dump) {
              return;
            }
            const bytes = chunk;
            timingInfo.encodedBodySize += bytes.byteLength;
            return this.body.push(bytes);
          },
          onComplete() {
            if (this.abort) {
              fetchParams.controller.off("terminated", this.abort);
            }
            fetchParams.controller.ended = true;
            this.body.push(null);
          },
          onError(error) {
            if (this.abort) {
              fetchParams.controller.off("terminated", this.abort);
            }
            this.body?.destroy(error);
            fetchParams.controller.terminate(error);
            reject(error);
          },
          onUpgrade(status, rawHeaders, socket) {
            if (status !== 101) {
              return;
            }
            const headersList = new HeadersList();
            for (let i = 0; i < rawHeaders.length; i += 2) {
              headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString("latin1"), true);
            }
            resolve({
              status,
              statusText: STATUS_CODES[status],
              headersList,
              socket
            });
            return true;
          }
        }
      ));
    }
  }
  fetch_1 = {
    fetch,
    Fetch,
    fetching,
    finalizeAndReportTiming
  };
  return fetch_1;
}
export {
  requireFetch as __require
};
//# sourceMappingURL=index46.js.map
