import { __require as requireParse } from "./index95.js";
import { __require as requireUtil } from "./index96.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireHeaders } from "./index47.js";
var cookies;
var hasRequiredCookies;
function requireCookies() {
  if (hasRequiredCookies) return cookies;
  hasRequiredCookies = 1;
  const { parseSetCookie } = requireParse();
  const { stringify } = requireUtil();
  const { webidl } = requireWebidl();
  const { Headers } = requireHeaders();
  const brandChecks = webidl.brandCheckMultiple([Headers, globalThis.Headers].filter(Boolean));
  function getCookies(headers) {
    webidl.argumentLengthCheck(arguments, 1, "getCookies");
    brandChecks(headers);
    const cookie = headers.get("cookie");
    const out = {};
    if (!cookie) {
      return out;
    }
    for (const piece of cookie.split(";")) {
      const [name, ...value] = piece.split("=");
      out[name.trim()] = value.join("=");
    }
    return out;
  }
  function deleteCookie(headers, name, attributes) {
    brandChecks(headers);
    const prefix = "deleteCookie";
    webidl.argumentLengthCheck(arguments, 2, prefix);
    name = webidl.converters.DOMString(name, prefix, "name");
    attributes = webidl.converters.DeleteCookieAttributes(attributes);
    setCookie(headers, {
      name,
      value: "",
      expires: /* @__PURE__ */ new Date(0),
      ...attributes
    });
  }
  function getSetCookies(headers) {
    webidl.argumentLengthCheck(arguments, 1, "getSetCookies");
    brandChecks(headers);
    const cookies2 = headers.getSetCookie();
    if (!cookies2) {
      return [];
    }
    return cookies2.map((pair) => parseSetCookie(pair));
  }
  function parseCookie(cookie) {
    cookie = webidl.converters.DOMString(cookie);
    return parseSetCookie(cookie);
  }
  function setCookie(headers, cookie) {
    webidl.argumentLengthCheck(arguments, 2, "setCookie");
    brandChecks(headers);
    cookie = webidl.converters.Cookie(cookie);
    const str = stringify(cookie);
    if (str) {
      headers.append("set-cookie", str, true);
    }
  }
  webidl.converters.DeleteCookieAttributes = webidl.dictionaryConverter([
    {
      converter: webidl.nullableConverter(webidl.converters.DOMString),
      key: "path",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters.DOMString),
      key: "domain",
      defaultValue: () => null
    }
  ]);
  webidl.converters.Cookie = webidl.dictionaryConverter([
    {
      converter: webidl.converters.DOMString,
      key: "name"
    },
    {
      converter: webidl.converters.DOMString,
      key: "value"
    },
    {
      converter: webidl.nullableConverter((value) => {
        if (typeof value === "number") {
          return webidl.converters["unsigned long long"](value);
        }
        return new Date(value);
      }),
      key: "expires",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters["long long"]),
      key: "maxAge",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters.DOMString),
      key: "domain",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters.DOMString),
      key: "path",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters.boolean),
      key: "secure",
      defaultValue: () => null
    },
    {
      converter: webidl.nullableConverter(webidl.converters.boolean),
      key: "httpOnly",
      defaultValue: () => null
    },
    {
      converter: webidl.converters.USVString,
      key: "sameSite",
      allowedValues: ["Strict", "Lax", "None"]
    },
    {
      converter: webidl.sequenceConverter(webidl.converters.DOMString),
      key: "unparsed",
      defaultValue: () => []
    }
  ]);
  cookies = {
    getCookies,
    deleteCookie,
    getSetCookies,
    setCookie,
    parseCookie
  };
  return cookies;
}
export {
  requireCookies as __require
};
//# sourceMappingURL=index54.js.map
