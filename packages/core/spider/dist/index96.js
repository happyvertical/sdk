var util;
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  function isCTLExcludingHtab(value) {
    for (let i = 0; i < value.length; ++i) {
      const code = value.charCodeAt(i);
      if (code >= 0 && code <= 8 || code >= 10 && code <= 31 || code === 127) {
        return true;
      }
    }
    return false;
  }
  function validateCookieName(name) {
    for (let i = 0; i < name.length; ++i) {
      const code = name.charCodeAt(i);
      if (code < 33 || // exclude CTLs (0-31), SP and HT
      code > 126 || // exclude non-ascii and DEL
      code === 34 || // "
      code === 40 || // (
      code === 41 || // )
      code === 60 || // <
      code === 62 || // >
      code === 64 || // @
      code === 44 || // ,
      code === 59 || // ;
      code === 58 || // :
      code === 92 || // \
      code === 47 || // /
      code === 91 || // [
      code === 93 || // ]
      code === 63 || // ?
      code === 61 || // =
      code === 123 || // {
      code === 125) {
        throw new Error("Invalid cookie name");
      }
    }
  }
  function validateCookieValue(value) {
    let len = value.length;
    let i = 0;
    if (value[0] === '"') {
      if (len === 1 || value[len - 1] !== '"') {
        throw new Error("Invalid cookie value");
      }
      --len;
      ++i;
    }
    while (i < len) {
      const code = value.charCodeAt(i++);
      if (code < 33 || // exclude CTLs (0-31)
      code > 126 || // non-ascii and DEL (127)
      code === 34 || // "
      code === 44 || // ,
      code === 59 || // ;
      code === 92) {
        throw new Error("Invalid cookie value");
      }
    }
  }
  function validateCookiePath(path) {
    for (let i = 0; i < path.length; ++i) {
      const code = path.charCodeAt(i);
      if (code < 32 || // exclude CTLs (0-31)
      code === 127 || // DEL
      code === 59) {
        throw new Error("Invalid cookie path");
      }
    }
  }
  function validateCookieDomain(domain) {
    if (domain.startsWith("-") || domain.endsWith(".") || domain.endsWith("-")) {
      throw new Error("Invalid cookie domain");
    }
  }
  const IMFDays = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
  ];
  const IMFMonths = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const IMFPaddedNumbers = Array(61).fill(0).map((_, i) => i.toString().padStart(2, "0"));
  function toIMFDate(date) {
    if (typeof date === "number") {
      date = new Date(date);
    }
    return `${IMFDays[date.getUTCDay()]}, ${IMFPaddedNumbers[date.getUTCDate()]} ${IMFMonths[date.getUTCMonth()]} ${date.getUTCFullYear()} ${IMFPaddedNumbers[date.getUTCHours()]}:${IMFPaddedNumbers[date.getUTCMinutes()]}:${IMFPaddedNumbers[date.getUTCSeconds()]} GMT`;
  }
  function validateCookieMaxAge(maxAge) {
    if (maxAge < 0) {
      throw new Error("Invalid cookie max-age");
    }
  }
  function stringify(cookie) {
    if (cookie.name.length === 0) {
      return null;
    }
    validateCookieName(cookie.name);
    validateCookieValue(cookie.value);
    const out = [`${cookie.name}=${cookie.value}`];
    if (cookie.name.startsWith("__Secure-")) {
      cookie.secure = true;
    }
    if (cookie.name.startsWith("__Host-")) {
      cookie.secure = true;
      cookie.domain = null;
      cookie.path = "/";
    }
    if (cookie.secure) {
      out.push("Secure");
    }
    if (cookie.httpOnly) {
      out.push("HttpOnly");
    }
    if (typeof cookie.maxAge === "number") {
      validateCookieMaxAge(cookie.maxAge);
      out.push(`Max-Age=${cookie.maxAge}`);
    }
    if (cookie.domain) {
      validateCookieDomain(cookie.domain);
      out.push(`Domain=${cookie.domain}`);
    }
    if (cookie.path) {
      validateCookiePath(cookie.path);
      out.push(`Path=${cookie.path}`);
    }
    if (cookie.expires && cookie.expires.toString() !== "Invalid Date") {
      out.push(`Expires=${toIMFDate(cookie.expires)}`);
    }
    if (cookie.sameSite) {
      out.push(`SameSite=${cookie.sameSite}`);
    }
    for (const part of cookie.unparsed) {
      if (!part.includes("=")) {
        throw new Error("Invalid unparsed");
      }
      const [key, ...value] = part.split("=");
      out.push(`${key.trim()}=${value.join("=")}`);
    }
    return out.join("; ");
  }
  util = {
    isCTLExcludingHtab,
    validateCookieName,
    validateCookiePath,
    validateCookieValue,
    toIMFDate,
    stringify
  };
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index96.js.map
