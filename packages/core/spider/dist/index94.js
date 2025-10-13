import require$$0 from "node:assert";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireUtil } from "./index114.js";
import { __require as requireUtil$1 } from "./index24.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireResponse } from "./index48.js";
import { __require as requireRequest } from "./index49.js";
import { __require as requireFetch } from "./index46.js";
import { __require as requireUtil$2 } from "./index88.js";
import { __require as requirePromise } from "./index93.js";
var cache;
var hasRequiredCache;
function requireCache() {
  if (hasRequiredCache) return cache;
  hasRequiredCache = 1;
  const assert = require$$0;
  const { kConstruct } = requireSymbols();
  const { urlEquals, getFieldValues } = requireUtil();
  const { kEnumerableProperty, isDisturbed } = requireUtil$1();
  const { webidl } = requireWebidl();
  const { cloneResponse, fromInnerResponse, getResponseState } = requireResponse();
  const { Request, fromInnerRequest, getRequestState } = requireRequest();
  const { fetching } = requireFetch();
  const { urlIsHttpHttpsScheme, readAllBytes } = requireUtil$2();
  const { createDeferredPromise } = requirePromise();
  class Cache {
    /**
     * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-request-response-list
     * @type {requestResponseList}
     */
    #relevantRequestResponseList;
    constructor() {
      if (arguments[0] !== kConstruct) {
        webidl.illegalConstructor();
      }
      webidl.util.markAsUncloneable(this);
      this.#relevantRequestResponseList = arguments[1];
    }
    async match(request, options = {}) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.match";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      request = webidl.converters.RequestInfo(request);
      options = webidl.converters.CacheQueryOptions(options, prefix, "options");
      const p = this.#internalMatchAll(request, options, 1);
      if (p.length === 0) {
        return;
      }
      return p[0];
    }
    async matchAll(request = void 0, options = {}) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.matchAll";
      if (request !== void 0) request = webidl.converters.RequestInfo(request);
      options = webidl.converters.CacheQueryOptions(options, prefix, "options");
      return this.#internalMatchAll(request, options);
    }
    async add(request) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.add";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      request = webidl.converters.RequestInfo(request);
      const requests = [request];
      const responseArrayPromise = this.addAll(requests);
      return await responseArrayPromise;
    }
    async addAll(requests) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.addAll";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      const responsePromises = [];
      const requestList = [];
      for (let request of requests) {
        if (request === void 0) {
          throw webidl.errors.conversionFailed({
            prefix,
            argument: "Argument 1",
            types: ["undefined is not allowed"]
          });
        }
        request = webidl.converters.RequestInfo(request);
        if (typeof request === "string") {
          continue;
        }
        const r = getRequestState(request);
        if (!urlIsHttpHttpsScheme(r.url) || r.method !== "GET") {
          throw webidl.errors.exception({
            header: prefix,
            message: "Expected http/s scheme when method is not GET."
          });
        }
      }
      const fetchControllers = [];
      for (const request of requests) {
        const r = getRequestState(new Request(request));
        if (!urlIsHttpHttpsScheme(r.url)) {
          throw webidl.errors.exception({
            header: prefix,
            message: "Expected http/s scheme."
          });
        }
        r.initiator = "fetch";
        r.destination = "subresource";
        requestList.push(r);
        const responsePromise = createDeferredPromise();
        fetchControllers.push(fetching({
          request: r,
          processResponse(response) {
            if (response.type === "error" || response.status === 206 || response.status < 200 || response.status > 299) {
              responsePromise.reject(webidl.errors.exception({
                header: "Cache.addAll",
                message: "Received an invalid status code or the request failed."
              }));
            } else if (response.headersList.contains("vary")) {
              const fieldValues = getFieldValues(response.headersList.get("vary"));
              for (const fieldValue of fieldValues) {
                if (fieldValue === "*") {
                  responsePromise.reject(webidl.errors.exception({
                    header: "Cache.addAll",
                    message: "invalid vary field value"
                  }));
                  for (const controller of fetchControllers) {
                    controller.abort();
                  }
                  return;
                }
              }
            }
          },
          processResponseEndOfBody(response) {
            if (response.aborted) {
              responsePromise.reject(new DOMException("aborted", "AbortError"));
              return;
            }
            responsePromise.resolve(response);
          }
        }));
        responsePromises.push(responsePromise.promise);
      }
      const p = Promise.all(responsePromises);
      const responses = await p;
      const operations = [];
      let index = 0;
      for (const response of responses) {
        const operation = {
          type: "put",
          // 7.3.2
          request: requestList[index],
          // 7.3.3
          response
          // 7.3.4
        };
        operations.push(operation);
        index++;
      }
      const cacheJobPromise = createDeferredPromise();
      let errorData = null;
      try {
        this.#batchCacheOperations(operations);
      } catch (e) {
        errorData = e;
      }
      queueMicrotask(() => {
        if (errorData === null) {
          cacheJobPromise.resolve(void 0);
        } else {
          cacheJobPromise.reject(errorData);
        }
      });
      return cacheJobPromise.promise;
    }
    async put(request, response) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.put";
      webidl.argumentLengthCheck(arguments, 2, prefix);
      request = webidl.converters.RequestInfo(request);
      response = webidl.converters.Response(response, prefix, "response");
      let innerRequest = null;
      if (webidl.is.Request(request)) {
        innerRequest = getRequestState(request);
      } else {
        innerRequest = getRequestState(new Request(request));
      }
      if (!urlIsHttpHttpsScheme(innerRequest.url) || innerRequest.method !== "GET") {
        throw webidl.errors.exception({
          header: prefix,
          message: "Expected an http/s scheme when method is not GET"
        });
      }
      const innerResponse = getResponseState(response);
      if (innerResponse.status === 206) {
        throw webidl.errors.exception({
          header: prefix,
          message: "Got 206 status"
        });
      }
      if (innerResponse.headersList.contains("vary")) {
        const fieldValues = getFieldValues(innerResponse.headersList.get("vary"));
        for (const fieldValue of fieldValues) {
          if (fieldValue === "*") {
            throw webidl.errors.exception({
              header: prefix,
              message: "Got * vary field value"
            });
          }
        }
      }
      if (innerResponse.body && (isDisturbed(innerResponse.body.stream) || innerResponse.body.stream.locked)) {
        throw webidl.errors.exception({
          header: prefix,
          message: "Response body is locked or disturbed"
        });
      }
      const clonedResponse = cloneResponse(innerResponse);
      const bodyReadPromise = createDeferredPromise();
      if (innerResponse.body != null) {
        const stream = innerResponse.body.stream;
        const reader = stream.getReader();
        readAllBytes(reader, bodyReadPromise.resolve, bodyReadPromise.reject);
      } else {
        bodyReadPromise.resolve(void 0);
      }
      const operations = [];
      const operation = {
        type: "put",
        // 14.
        request: innerRequest,
        // 15.
        response: clonedResponse
        // 16.
      };
      operations.push(operation);
      const bytes = await bodyReadPromise.promise;
      if (clonedResponse.body != null) {
        clonedResponse.body.source = bytes;
      }
      const cacheJobPromise = createDeferredPromise();
      let errorData = null;
      try {
        this.#batchCacheOperations(operations);
      } catch (e) {
        errorData = e;
      }
      queueMicrotask(() => {
        if (errorData === null) {
          cacheJobPromise.resolve();
        } else {
          cacheJobPromise.reject(errorData);
        }
      });
      return cacheJobPromise.promise;
    }
    async delete(request, options = {}) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.delete";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      request = webidl.converters.RequestInfo(request);
      options = webidl.converters.CacheQueryOptions(options, prefix, "options");
      let r = null;
      if (webidl.is.Request(request)) {
        r = getRequestState(request);
        if (r.method !== "GET" && !options.ignoreMethod) {
          return false;
        }
      } else {
        assert(typeof request === "string");
        r = getRequestState(new Request(request));
      }
      const operations = [];
      const operation = {
        type: "delete",
        request: r,
        options
      };
      operations.push(operation);
      const cacheJobPromise = createDeferredPromise();
      let errorData = null;
      let requestResponses;
      try {
        requestResponses = this.#batchCacheOperations(operations);
      } catch (e) {
        errorData = e;
      }
      queueMicrotask(() => {
        if (errorData === null) {
          cacheJobPromise.resolve(!!requestResponses?.length);
        } else {
          cacheJobPromise.reject(errorData);
        }
      });
      return cacheJobPromise.promise;
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#dom-cache-keys
     * @param {any} request
     * @param {import('../../../types/cache').CacheQueryOptions} options
     * @returns {Promise<readonly Request[]>}
     */
    async keys(request = void 0, options = {}) {
      webidl.brandCheck(this, Cache);
      const prefix = "Cache.keys";
      if (request !== void 0) request = webidl.converters.RequestInfo(request);
      options = webidl.converters.CacheQueryOptions(options, prefix, "options");
      let r = null;
      if (request !== void 0) {
        if (webidl.is.Request(request)) {
          r = getRequestState(request);
          if (r.method !== "GET" && !options.ignoreMethod) {
            return [];
          }
        } else if (typeof request === "string") {
          r = getRequestState(new Request(request));
        }
      }
      const promise = createDeferredPromise();
      const requests = [];
      if (request === void 0) {
        for (const requestResponse of this.#relevantRequestResponseList) {
          requests.push(requestResponse[0]);
        }
      } else {
        const requestResponses = this.#queryCache(r, options);
        for (const requestResponse of requestResponses) {
          requests.push(requestResponse[0]);
        }
      }
      queueMicrotask(() => {
        const requestList = [];
        for (const request2 of requests) {
          const requestObject = fromInnerRequest(
            request2,
            void 0,
            new AbortController().signal,
            "immutable"
          );
          requestList.push(requestObject);
        }
        promise.resolve(Object.freeze(requestList));
      });
      return promise.promise;
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#batch-cache-operations-algorithm
     * @param {CacheBatchOperation[]} operations
     * @returns {requestResponseList}
     */
    #batchCacheOperations(operations) {
      const cache2 = this.#relevantRequestResponseList;
      const backupCache = [...cache2];
      const addedItems = [];
      const resultList = [];
      try {
        for (const operation of operations) {
          if (operation.type !== "delete" && operation.type !== "put") {
            throw webidl.errors.exception({
              header: "Cache.#batchCacheOperations",
              message: 'operation type does not match "delete" or "put"'
            });
          }
          if (operation.type === "delete" && operation.response != null) {
            throw webidl.errors.exception({
              header: "Cache.#batchCacheOperations",
              message: "delete operation should not have an associated response"
            });
          }
          if (this.#queryCache(operation.request, operation.options, addedItems).length) {
            throw new DOMException("???", "InvalidStateError");
          }
          let requestResponses;
          if (operation.type === "delete") {
            requestResponses = this.#queryCache(operation.request, operation.options);
            if (requestResponses.length === 0) {
              return [];
            }
            for (const requestResponse of requestResponses) {
              const idx = cache2.indexOf(requestResponse);
              assert(idx !== -1);
              cache2.splice(idx, 1);
            }
          } else if (operation.type === "put") {
            if (operation.response == null) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "put operation should have an associated response"
              });
            }
            const r = operation.request;
            if (!urlIsHttpHttpsScheme(r.url)) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "expected http or https scheme"
              });
            }
            if (r.method !== "GET") {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "not get method"
              });
            }
            if (operation.options != null) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "options must not be defined"
              });
            }
            requestResponses = this.#queryCache(operation.request);
            for (const requestResponse of requestResponses) {
              const idx = cache2.indexOf(requestResponse);
              assert(idx !== -1);
              cache2.splice(idx, 1);
            }
            cache2.push([operation.request, operation.response]);
            addedItems.push([operation.request, operation.response]);
          }
          resultList.push([operation.request, operation.response]);
        }
        return resultList;
      } catch (e) {
        this.#relevantRequestResponseList.length = 0;
        this.#relevantRequestResponseList = backupCache;
        throw e;
      }
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#query-cache
     * @param {any} requestQuery
     * @param {import('../../../types/cache').CacheQueryOptions} options
     * @param {requestResponseList} targetStorage
     * @returns {requestResponseList}
     */
    #queryCache(requestQuery, options, targetStorage) {
      const resultList = [];
      const storage = targetStorage ?? this.#relevantRequestResponseList;
      for (const requestResponse of storage) {
        const [cachedRequest, cachedResponse] = requestResponse;
        if (this.#requestMatchesCachedItem(requestQuery, cachedRequest, cachedResponse, options)) {
          resultList.push(requestResponse);
        }
      }
      return resultList;
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item-algorithm
     * @param {any} requestQuery
     * @param {any} request
     * @param {any | null} response
     * @param {import('../../../types/cache').CacheQueryOptions | undefined} options
     * @returns {boolean}
     */
    #requestMatchesCachedItem(requestQuery, request, response = null, options) {
      const queryURL = new URL(requestQuery.url);
      const cachedURL = new URL(request.url);
      if (options?.ignoreSearch) {
        cachedURL.search = "";
        queryURL.search = "";
      }
      if (!urlEquals(queryURL, cachedURL, true)) {
        return false;
      }
      if (response == null || options?.ignoreVary || !response.headersList.contains("vary")) {
        return true;
      }
      const fieldValues = getFieldValues(response.headersList.get("vary"));
      for (const fieldValue of fieldValues) {
        if (fieldValue === "*") {
          return false;
        }
        const requestValue = request.headersList.get(fieldValue);
        const queryValue = requestQuery.headersList.get(fieldValue);
        if (requestValue !== queryValue) {
          return false;
        }
      }
      return true;
    }
    #internalMatchAll(request, options, maxResponses = Infinity) {
      let r = null;
      if (request !== void 0) {
        if (webidl.is.Request(request)) {
          r = getRequestState(request);
          if (r.method !== "GET" && !options.ignoreMethod) {
            return [];
          }
        } else if (typeof request === "string") {
          r = getRequestState(new Request(request));
        }
      }
      const responses = [];
      if (request === void 0) {
        for (const requestResponse of this.#relevantRequestResponseList) {
          responses.push(requestResponse[1]);
        }
      } else {
        const requestResponses = this.#queryCache(r, options);
        for (const requestResponse of requestResponses) {
          responses.push(requestResponse[1]);
        }
      }
      const responseList = [];
      for (const response of responses) {
        const responseObject = fromInnerResponse(response, "immutable");
        responseList.push(responseObject.clone());
        if (responseList.length >= maxResponses) {
          break;
        }
      }
      return Object.freeze(responseList);
    }
  }
  Object.defineProperties(Cache.prototype, {
    [Symbol.toStringTag]: {
      value: "Cache",
      configurable: true
    },
    match: kEnumerableProperty,
    matchAll: kEnumerableProperty,
    add: kEnumerableProperty,
    addAll: kEnumerableProperty,
    put: kEnumerableProperty,
    delete: kEnumerableProperty,
    keys: kEnumerableProperty
  });
  const cacheQueryOptionConverters = [
    {
      key: "ignoreSearch",
      converter: webidl.converters.boolean,
      defaultValue: () => false
    },
    {
      key: "ignoreMethod",
      converter: webidl.converters.boolean,
      defaultValue: () => false
    },
    {
      key: "ignoreVary",
      converter: webidl.converters.boolean,
      defaultValue: () => false
    }
  ];
  webidl.converters.CacheQueryOptions = webidl.dictionaryConverter(cacheQueryOptionConverters);
  webidl.converters.MultiCacheQueryOptions = webidl.dictionaryConverter([
    ...cacheQueryOptionConverters,
    {
      key: "cacheName",
      converter: webidl.converters.DOMString
    }
  ]);
  webidl.converters.Response = webidl.interfaceConverter(
    webidl.is.Response,
    "Response"
  );
  webidl.converters["sequence<RequestInfo>"] = webidl.sequenceConverter(
    webidl.converters.RequestInfo
  );
  cache = {
    Cache
  };
  return cache;
}
export {
  requireCache as __require
};
//# sourceMappingURL=index94.js.map
