import require$$0 from "node:assert";
var dataUrl;
var hasRequiredDataUrl;
function requireDataUrl() {
  if (hasRequiredDataUrl) return dataUrl;
  hasRequiredDataUrl = 1;
  const assert = require$$0;
  const encoder = new TextEncoder();
  const HTTP_TOKEN_CODEPOINTS = /^[!#$%&'*+\-.^_|~A-Za-z0-9]+$/;
  const HTTP_WHITESPACE_REGEX = /[\u000A\u000D\u0009\u0020]/;
  const ASCII_WHITESPACE_REPLACE_REGEX = /[\u0009\u000A\u000C\u000D\u0020]/g;
  const HTTP_QUOTED_STRING_TOKENS = /^[\u0009\u0020-\u007E\u0080-\u00FF]+$/;
  function dataURLProcessor(dataURL) {
    assert(dataURL.protocol === "data:");
    let input = URLSerializer(dataURL, true);
    input = input.slice(5);
    const position = { position: 0 };
    let mimeType = collectASequenceOfCodePointsFast(
      ",",
      input,
      position
    );
    const mimeTypeLength = mimeType.length;
    mimeType = removeASCIIWhitespace(mimeType, true, true);
    if (position.position >= input.length) {
      return "failure";
    }
    position.position++;
    const encodedBody = input.slice(mimeTypeLength + 1);
    let body = stringPercentDecode(encodedBody);
    if (/;(\u0020){0,}base64$/i.test(mimeType)) {
      const stringBody = isomorphicDecode(body);
      body = forgivingBase64(stringBody);
      if (body === "failure") {
        return "failure";
      }
      mimeType = mimeType.slice(0, -6);
      mimeType = mimeType.replace(/(\u0020)+$/, "");
      mimeType = mimeType.slice(0, -1);
    }
    if (mimeType.startsWith(";")) {
      mimeType = "text/plain" + mimeType;
    }
    let mimeTypeRecord = parseMIMEType(mimeType);
    if (mimeTypeRecord === "failure") {
      mimeTypeRecord = parseMIMEType("text/plain;charset=US-ASCII");
    }
    return { mimeType: mimeTypeRecord, body };
  }
  function URLSerializer(url, excludeFragment = false) {
    if (!excludeFragment) {
      return url.href;
    }
    const href = url.href;
    const hashLength = url.hash.length;
    const serialized = hashLength === 0 ? href : href.substring(0, href.length - hashLength);
    if (!hashLength && href.endsWith("#")) {
      return serialized.slice(0, -1);
    }
    return serialized;
  }
  function collectASequenceOfCodePoints(condition, input, position) {
    let result = "";
    while (position.position < input.length && condition(input[position.position])) {
      result += input[position.position];
      position.position++;
    }
    return result;
  }
  function collectASequenceOfCodePointsFast(char, input, position) {
    const idx = input.indexOf(char, position.position);
    const start = position.position;
    if (idx === -1) {
      position.position = input.length;
      return input.slice(start);
    }
    position.position = idx;
    return input.slice(start, position.position);
  }
  function stringPercentDecode(input) {
    const bytes = encoder.encode(input);
    return percentDecode(bytes);
  }
  function isHexCharByte(byte) {
    return byte >= 48 && byte <= 57 || byte >= 65 && byte <= 70 || byte >= 97 && byte <= 102;
  }
  function hexByteToNumber(byte) {
    return (
      // 0-9
      byte >= 48 && byte <= 57 ? byte - 48 : (byte & 223) - 55
    );
  }
  function percentDecode(input) {
    const length = input.length;
    const output = new Uint8Array(length);
    let j = 0;
    for (let i = 0; i < length; ++i) {
      const byte = input[i];
      if (byte !== 37) {
        output[j++] = byte;
      } else if (byte === 37 && !(isHexCharByte(input[i + 1]) && isHexCharByte(input[i + 2]))) {
        output[j++] = 37;
      } else {
        output[j++] = hexByteToNumber(input[i + 1]) << 4 | hexByteToNumber(input[i + 2]);
        i += 2;
      }
    }
    return length === j ? output : output.subarray(0, j);
  }
  function parseMIMEType(input) {
    input = removeHTTPWhitespace(input, true, true);
    const position = { position: 0 };
    const type = collectASequenceOfCodePointsFast(
      "/",
      input,
      position
    );
    if (type.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(type)) {
      return "failure";
    }
    if (position.position >= input.length) {
      return "failure";
    }
    position.position++;
    let subtype = collectASequenceOfCodePointsFast(
      ";",
      input,
      position
    );
    subtype = removeHTTPWhitespace(subtype, false, true);
    if (subtype.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(subtype)) {
      return "failure";
    }
    const typeLowercase = type.toLowerCase();
    const subtypeLowercase = subtype.toLowerCase();
    const mimeType = {
      type: typeLowercase,
      subtype: subtypeLowercase,
      /** @type {Map<string, string>} */
      parameters: /* @__PURE__ */ new Map(),
      // https://mimesniff.spec.whatwg.org/#mime-type-essence
      essence: `${typeLowercase}/${subtypeLowercase}`
    };
    while (position.position < input.length) {
      position.position++;
      collectASequenceOfCodePoints(
        // https://fetch.spec.whatwg.org/#http-whitespace
        (char) => HTTP_WHITESPACE_REGEX.test(char),
        input,
        position
      );
      let parameterName = collectASequenceOfCodePoints(
        (char) => char !== ";" && char !== "=",
        input,
        position
      );
      parameterName = parameterName.toLowerCase();
      if (position.position < input.length) {
        if (input[position.position] === ";") {
          continue;
        }
        position.position++;
      }
      if (position.position >= input.length) {
        break;
      }
      let parameterValue = null;
      if (input[position.position] === '"') {
        parameterValue = collectAnHTTPQuotedString(input, position, true);
        collectASequenceOfCodePointsFast(
          ";",
          input,
          position
        );
      } else {
        parameterValue = collectASequenceOfCodePointsFast(
          ";",
          input,
          position
        );
        parameterValue = removeHTTPWhitespace(parameterValue, false, true);
        if (parameterValue.length === 0) {
          continue;
        }
      }
      if (parameterName.length !== 0 && HTTP_TOKEN_CODEPOINTS.test(parameterName) && (parameterValue.length === 0 || HTTP_QUOTED_STRING_TOKENS.test(parameterValue)) && !mimeType.parameters.has(parameterName)) {
        mimeType.parameters.set(parameterName, parameterValue);
      }
    }
    return mimeType;
  }
  function forgivingBase64(data) {
    data = data.replace(ASCII_WHITESPACE_REPLACE_REGEX, "");
    let dataLength = data.length;
    if (dataLength % 4 === 0) {
      if (data.charCodeAt(dataLength - 1) === 61) {
        --dataLength;
        if (data.charCodeAt(dataLength - 1) === 61) {
          --dataLength;
        }
      }
    }
    if (dataLength % 4 === 1) {
      return "failure";
    }
    if (/[^+/0-9A-Za-z]/.test(data.length === dataLength ? data : data.substring(0, dataLength))) {
      return "failure";
    }
    const buffer = Buffer.from(data, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  function collectAnHTTPQuotedString(input, position, extractValue = false) {
    const positionStart = position.position;
    let value = "";
    assert(input[position.position] === '"');
    position.position++;
    while (true) {
      value += collectASequenceOfCodePoints(
        (char) => char !== '"' && char !== "\\",
        input,
        position
      );
      if (position.position >= input.length) {
        break;
      }
      const quoteOrBackslash = input[position.position];
      position.position++;
      if (quoteOrBackslash === "\\") {
        if (position.position >= input.length) {
          value += "\\";
          break;
        }
        value += input[position.position];
        position.position++;
      } else {
        assert(quoteOrBackslash === '"');
        break;
      }
    }
    if (extractValue) {
      return value;
    }
    return input.slice(positionStart, position.position);
  }
  function serializeAMimeType(mimeType) {
    assert(mimeType !== "failure");
    const { parameters, essence } = mimeType;
    let serialization = essence;
    for (let [name, value] of parameters.entries()) {
      serialization += ";";
      serialization += name;
      serialization += "=";
      if (!HTTP_TOKEN_CODEPOINTS.test(value)) {
        value = value.replace(/(\\|")/g, "\\$1");
        value = '"' + value;
        value += '"';
      }
      serialization += value;
    }
    return serialization;
  }
  function isHTTPWhiteSpace(char) {
    return char === 13 || char === 10 || char === 9 || char === 32;
  }
  function removeHTTPWhitespace(str, leading = true, trailing = true) {
    return removeChars(str, leading, trailing, isHTTPWhiteSpace);
  }
  function isASCIIWhitespace(char) {
    return char === 13 || char === 10 || char === 9 || char === 12 || char === 32;
  }
  function removeASCIIWhitespace(str, leading = true, trailing = true) {
    return removeChars(str, leading, trailing, isASCIIWhitespace);
  }
  function removeChars(str, leading, trailing, predicate) {
    let lead = 0;
    let trail = str.length - 1;
    if (leading) {
      while (lead < str.length && predicate(str.charCodeAt(lead))) lead++;
    }
    if (trailing) {
      while (trail > 0 && predicate(str.charCodeAt(trail))) trail--;
    }
    return lead === 0 && trail === str.length - 1 ? str : str.slice(lead, trail + 1);
  }
  function isomorphicDecode(input) {
    const length = input.length;
    if ((2 << 15) - 1 > length) {
      return String.fromCharCode.apply(null, input);
    }
    let result = "";
    let i = 0;
    let addition = (2 << 15) - 1;
    while (i < length) {
      if (i + addition > length) {
        addition = length - i;
      }
      result += String.fromCharCode.apply(null, input.subarray(i, i += addition));
    }
    return result;
  }
  function minimizeSupportedMimeType(mimeType) {
    switch (mimeType.essence) {
      case "application/ecmascript":
      case "application/javascript":
      case "application/x-ecmascript":
      case "application/x-javascript":
      case "text/ecmascript":
      case "text/javascript":
      case "text/javascript1.0":
      case "text/javascript1.1":
      case "text/javascript1.2":
      case "text/javascript1.3":
      case "text/javascript1.4":
      case "text/javascript1.5":
      case "text/jscript":
      case "text/livescript":
      case "text/x-ecmascript":
      case "text/x-javascript":
        return "text/javascript";
      case "application/json":
      case "text/json":
        return "application/json";
      case "image/svg+xml":
        return "image/svg+xml";
      case "text/xml":
      case "application/xml":
        return "application/xml";
    }
    if (mimeType.subtype.endsWith("+json")) {
      return "application/json";
    }
    if (mimeType.subtype.endsWith("+xml")) {
      return "application/xml";
    }
    return "";
  }
  dataUrl = {
    dataURLProcessor,
    URLSerializer,
    collectASequenceOfCodePoints,
    collectASequenceOfCodePointsFast,
    stringPercentDecode,
    parseMIMEType,
    collectAnHTTPQuotedString,
    serializeAMimeType,
    removeChars,
    removeHTTPWhitespace,
    minimizeSupportedMimeType,
    HTTP_TOKEN_CODEPOINTS,
    isomorphicDecode
  };
  return dataUrl;
}
export {
  requireDataUrl as __require
};
//# sourceMappingURL=index55.js.map
