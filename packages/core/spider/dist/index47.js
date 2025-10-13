import { __require as requireSymbols } from "./index53.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireWebidl } from "./index91.js";
import require$$0$1 from "node:assert";
import require$$0 from "node:util";
var headers;
var hasRequiredHeaders;
function requireHeaders() {
  if (hasRequiredHeaders) return headers;
  hasRequiredHeaders = 1;
  const { kConstruct } = requireSymbols();
  const { kEnumerableProperty } = requireUtil();
  const {
    iteratorMixin,
    isValidHeaderName,
    isValidHeaderValue
  } = requireUtil$1();
  const { webidl } = requireWebidl();
  const assert = require$$0$1;
  const util = require$$0;
  function isHTTPWhiteSpaceCharCode(code) {
    return code === 10 || code === 13 || code === 9 || code === 32;
  }
  function headerValueNormalize(potentialValue) {
    let i = 0;
    let j = potentialValue.length;
    while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(j - 1))) --j;
    while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(i))) ++i;
    return i === 0 && j === potentialValue.length ? potentialValue : potentialValue.substring(i, j);
  }
  function fill(headers2, object) {
    if (Array.isArray(object)) {
      for (let i = 0; i < object.length; ++i) {
        const header = object[i];
        if (header.length !== 2) {
          throw webidl.errors.exception({
            header: "Headers constructor",
            message: `expected name/value pair to be length 2, found ${header.length}.`
          });
        }
        appendHeader(headers2, header[0], header[1]);
      }
    } else if (typeof object === "object" && object !== null) {
      const keys = Object.keys(object);
      for (let i = 0; i < keys.length; ++i) {
        appendHeader(headers2, keys[i], object[keys[i]]);
      }
    } else {
      throw webidl.errors.conversionFailed({
        prefix: "Headers constructor",
        argument: "Argument 1",
        types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
      });
    }
  }
  function appendHeader(headers2, name, value) {
    value = headerValueNormalize(value);
    if (!isValidHeaderName(name)) {
      throw webidl.errors.invalidArgument({
        prefix: "Headers.append",
        value: name,
        type: "header name"
      });
    } else if (!isValidHeaderValue(value)) {
      throw webidl.errors.invalidArgument({
        prefix: "Headers.append",
        value,
        type: "header value"
      });
    }
    if (getHeadersGuard(headers2) === "immutable") {
      throw new TypeError("immutable");
    }
    return getHeadersList(headers2).append(name, value, false);
  }
  function headersListSortAndCombine(target) {
    const headersList = getHeadersList(target);
    if (!headersList) {
      return [];
    }
    if (headersList.sortedMap) {
      return headersList.sortedMap;
    }
    const headers2 = [];
    const names = headersList.toSortedArray();
    const cookies = headersList.cookies;
    if (cookies === null || cookies.length === 1) {
      return headersList.sortedMap = names;
    }
    for (let i = 0; i < names.length; ++i) {
      const { 0: name, 1: value } = names[i];
      if (name === "set-cookie") {
        for (let j = 0; j < cookies.length; ++j) {
          headers2.push([name, cookies[j]]);
        }
      } else {
        headers2.push([name, value]);
      }
    }
    return headersList.sortedMap = headers2;
  }
  function compareHeaderName(a, b) {
    return a[0] < b[0] ? -1 : 1;
  }
  class HeadersList {
    /** @type {[string, string][]|null} */
    cookies = null;
    sortedMap;
    headersMap;
    constructor(init) {
      if (init instanceof HeadersList) {
        this.headersMap = new Map(init.headersMap);
        this.sortedMap = init.sortedMap;
        this.cookies = init.cookies === null ? null : [...init.cookies];
      } else {
        this.headersMap = new Map(init);
        this.sortedMap = null;
      }
    }
    /**
     * @see https://fetch.spec.whatwg.org/#header-list-contains
     * @param {string} name
     * @param {boolean} isLowerCase
     */
    contains(name, isLowerCase) {
      return this.headersMap.has(isLowerCase ? name : name.toLowerCase());
    }
    clear() {
      this.headersMap.clear();
      this.sortedMap = null;
      this.cookies = null;
    }
    /**
     * @see https://fetch.spec.whatwg.org/#concept-header-list-append
     * @param {string} name
     * @param {string} value
     * @param {boolean} isLowerCase
     */
    append(name, value, isLowerCase) {
      this.sortedMap = null;
      const lowercaseName = isLowerCase ? name : name.toLowerCase();
      const exists = this.headersMap.get(lowercaseName);
      if (exists) {
        const delimiter = lowercaseName === "cookie" ? "; " : ", ";
        this.headersMap.set(lowercaseName, {
          name: exists.name,
          value: `${exists.value}${delimiter}${value}`
        });
      } else {
        this.headersMap.set(lowercaseName, { name, value });
      }
      if (lowercaseName === "set-cookie") {
        (this.cookies ??= []).push(value);
      }
    }
    /**
     * @see https://fetch.spec.whatwg.org/#concept-header-list-set
     * @param {string} name
     * @param {string} value
     * @param {boolean} isLowerCase
     */
    set(name, value, isLowerCase) {
      this.sortedMap = null;
      const lowercaseName = isLowerCase ? name : name.toLowerCase();
      if (lowercaseName === "set-cookie") {
        this.cookies = [value];
      }
      this.headersMap.set(lowercaseName, { name, value });
    }
    /**
     * @see https://fetch.spec.whatwg.org/#concept-header-list-delete
     * @param {string} name
     * @param {boolean} isLowerCase
     */
    delete(name, isLowerCase) {
      this.sortedMap = null;
      if (!isLowerCase) name = name.toLowerCase();
      if (name === "set-cookie") {
        this.cookies = null;
      }
      this.headersMap.delete(name);
    }
    /**
     * @see https://fetch.spec.whatwg.org/#concept-header-list-get
     * @param {string} name
     * @param {boolean} isLowerCase
     * @returns {string | null}
     */
    get(name, isLowerCase) {
      return this.headersMap.get(isLowerCase ? name : name.toLowerCase())?.value ?? null;
    }
    *[Symbol.iterator]() {
      for (const { 0: name, 1: { value } } of this.headersMap) {
        yield [name, value];
      }
    }
    get entries() {
      const headers2 = {};
      if (this.headersMap.size !== 0) {
        for (const { name, value } of this.headersMap.values()) {
          headers2[name] = value;
        }
      }
      return headers2;
    }
    rawValues() {
      return this.headersMap.values();
    }
    get entriesList() {
      const headers2 = [];
      if (this.headersMap.size !== 0) {
        for (const { 0: lowerName, 1: { name, value } } of this.headersMap) {
          if (lowerName === "set-cookie") {
            for (const cookie of this.cookies) {
              headers2.push([name, cookie]);
            }
          } else {
            headers2.push([name, value]);
          }
        }
      }
      return headers2;
    }
    // https://fetch.spec.whatwg.org/#convert-header-names-to-a-sorted-lowercase-set
    toSortedArray() {
      const size = this.headersMap.size;
      const array = new Array(size);
      if (size <= 32) {
        if (size === 0) {
          return array;
        }
        const iterator = this.headersMap[Symbol.iterator]();
        const firstValue = iterator.next().value;
        array[0] = [firstValue[0], firstValue[1].value];
        assert(firstValue[1].value !== null);
        for (let i = 1, j = 0, right = 0, left = 0, pivot = 0, x, value; i < size; ++i) {
          value = iterator.next().value;
          x = array[i] = [value[0], value[1].value];
          assert(x[1] !== null);
          left = 0;
          right = i;
          while (left < right) {
            pivot = left + (right - left >> 1);
            if (array[pivot][0] <= x[0]) {
              left = pivot + 1;
            } else {
              right = pivot;
            }
          }
          if (i !== pivot) {
            j = i;
            while (j > left) {
              array[j] = array[--j];
            }
            array[left] = x;
          }
        }
        if (!iterator.next().done) {
          throw new TypeError("Unreachable");
        }
        return array;
      } else {
        let i = 0;
        for (const { 0: name, 1: { value } } of this.headersMap) {
          array[i++] = [name, value];
          assert(value !== null);
        }
        return array.sort(compareHeaderName);
      }
    }
  }
  class Headers {
    #guard;
    /**
     * @type {HeadersList}
     */
    #headersList;
    /**
     * @param {HeadersInit|Symbol} [init]
     * @returns
     */
    constructor(init = void 0) {
      webidl.util.markAsUncloneable(this);
      if (init === kConstruct) {
        return;
      }
      this.#headersList = new HeadersList();
      this.#guard = "none";
      if (init !== void 0) {
        init = webidl.converters.HeadersInit(init, "Headers constructor", "init");
        fill(this, init);
      }
    }
    // https://fetch.spec.whatwg.org/#dom-headers-append
    append(name, value) {
      webidl.brandCheck(this, Headers);
      webidl.argumentLengthCheck(arguments, 2, "Headers.append");
      const prefix = "Headers.append";
      name = webidl.converters.ByteString(name, prefix, "name");
      value = webidl.converters.ByteString(value, prefix, "value");
      return appendHeader(this, name, value);
    }
    // https://fetch.spec.whatwg.org/#dom-headers-delete
    delete(name) {
      webidl.brandCheck(this, Headers);
      webidl.argumentLengthCheck(arguments, 1, "Headers.delete");
      const prefix = "Headers.delete";
      name = webidl.converters.ByteString(name, prefix, "name");
      if (!isValidHeaderName(name)) {
        throw webidl.errors.invalidArgument({
          prefix: "Headers.delete",
          value: name,
          type: "header name"
        });
      }
      if (this.#guard === "immutable") {
        throw new TypeError("immutable");
      }
      if (!this.#headersList.contains(name, false)) {
        return;
      }
      this.#headersList.delete(name, false);
    }
    // https://fetch.spec.whatwg.org/#dom-headers-get
    get(name) {
      webidl.brandCheck(this, Headers);
      webidl.argumentLengthCheck(arguments, 1, "Headers.get");
      const prefix = "Headers.get";
      name = webidl.converters.ByteString(name, prefix, "name");
      if (!isValidHeaderName(name)) {
        throw webidl.errors.invalidArgument({
          prefix,
          value: name,
          type: "header name"
        });
      }
      return this.#headersList.get(name, false);
    }
    // https://fetch.spec.whatwg.org/#dom-headers-has
    has(name) {
      webidl.brandCheck(this, Headers);
      webidl.argumentLengthCheck(arguments, 1, "Headers.has");
      const prefix = "Headers.has";
      name = webidl.converters.ByteString(name, prefix, "name");
      if (!isValidHeaderName(name)) {
        throw webidl.errors.invalidArgument({
          prefix,
          value: name,
          type: "header name"
        });
      }
      return this.#headersList.contains(name, false);
    }
    // https://fetch.spec.whatwg.org/#dom-headers-set
    set(name, value) {
      webidl.brandCheck(this, Headers);
      webidl.argumentLengthCheck(arguments, 2, "Headers.set");
      const prefix = "Headers.set";
      name = webidl.converters.ByteString(name, prefix, "name");
      value = webidl.converters.ByteString(value, prefix, "value");
      value = headerValueNormalize(value);
      if (!isValidHeaderName(name)) {
        throw webidl.errors.invalidArgument({
          prefix,
          value: name,
          type: "header name"
        });
      } else if (!isValidHeaderValue(value)) {
        throw webidl.errors.invalidArgument({
          prefix,
          value,
          type: "header value"
        });
      }
      if (this.#guard === "immutable") {
        throw new TypeError("immutable");
      }
      this.#headersList.set(name, value, false);
    }
    // https://fetch.spec.whatwg.org/#dom-headers-getsetcookie
    getSetCookie() {
      webidl.brandCheck(this, Headers);
      const list = this.#headersList.cookies;
      if (list) {
        return [...list];
      }
      return [];
    }
    [util.inspect.custom](depth, options) {
      options.depth ??= depth;
      return `Headers ${util.formatWithOptions(options, this.#headersList.entries)}`;
    }
    static getHeadersGuard(o) {
      return o.#guard;
    }
    static setHeadersGuard(o, guard) {
      o.#guard = guard;
    }
    /**
     * @param {Headers} o
     */
    static getHeadersList(o) {
      return o.#headersList;
    }
    /**
     * @param {Headers} target
     * @param {HeadersList} list
     */
    static setHeadersList(target, list) {
      target.#headersList = list;
    }
  }
  const { getHeadersGuard, setHeadersGuard, getHeadersList, setHeadersList } = Headers;
  Reflect.deleteProperty(Headers, "getHeadersGuard");
  Reflect.deleteProperty(Headers, "setHeadersGuard");
  Reflect.deleteProperty(Headers, "getHeadersList");
  Reflect.deleteProperty(Headers, "setHeadersList");
  iteratorMixin("Headers", Headers, headersListSortAndCombine, 0, 1);
  Object.defineProperties(Headers.prototype, {
    append: kEnumerableProperty,
    delete: kEnumerableProperty,
    get: kEnumerableProperty,
    has: kEnumerableProperty,
    set: kEnumerableProperty,
    getSetCookie: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "Headers",
      configurable: true
    },
    [util.inspect.custom]: {
      enumerable: false
    }
  });
  webidl.converters.HeadersInit = function(V, prefix, argument) {
    if (webidl.util.Type(V) === webidl.util.Types.OBJECT) {
      const iterator = Reflect.get(V, Symbol.iterator);
      if (!util.types.isProxy(V) && iterator === Headers.prototype.entries) {
        try {
          return getHeadersList(V).entriesList;
        } catch {
        }
      }
      if (typeof iterator === "function") {
        return webidl.converters["sequence<sequence<ByteString>>"](V, prefix, argument, iterator.bind(V));
      }
      return webidl.converters["record<ByteString, ByteString>"](V, prefix, argument);
    }
    throw webidl.errors.conversionFailed({
      prefix: "Headers constructor",
      argument: "Argument 1",
      types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
    });
  };
  headers = {
    fill,
    // for test.
    compareHeaderName,
    Headers,
    HeadersList,
    getHeadersGuard,
    setHeadersGuard,
    setHeadersList,
    getHeadersList
  };
  return headers;
}
export {
  requireHeaders as __require
};
//# sourceMappingURL=index47.js.map
