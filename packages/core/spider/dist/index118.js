import { __require as requireUtil } from "./index24.js";
import { __require as requireUtil$1 } from "./index88.js";
import { __require as requireDataUrl } from "./index55.js";
import { __require as requireFormdata } from "./index50.js";
import { __require as requireWebidl } from "./index91.js";
import require$$0 from "node:assert";
var formdataParser;
var hasRequiredFormdataParser;
function requireFormdataParser() {
  if (hasRequiredFormdataParser) return formdataParser;
  hasRequiredFormdataParser = 1;
  const { bufferToLowerCasedHeaderName } = requireUtil();
  const { utf8DecodeBytes } = requireUtil$1();
  const { HTTP_TOKEN_CODEPOINTS, isomorphicDecode } = requireDataUrl();
  const { makeEntry } = requireFormdata();
  const { webidl } = requireWebidl();
  const assert = require$$0;
  const formDataNameBuffer = Buffer.from('form-data; name="');
  const filenameBuffer = Buffer.from("filename");
  const dd = Buffer.from("--");
  const ddcrlf = Buffer.from("--\r\n");
  function isAsciiString(chars) {
    for (let i = 0; i < chars.length; ++i) {
      if ((chars.charCodeAt(i) & -128) !== 0) {
        return false;
      }
    }
    return true;
  }
  function validateBoundary(boundary) {
    const length = boundary.length;
    if (length < 27 || length > 70) {
      return false;
    }
    for (let i = 0; i < length; ++i) {
      const cp = boundary.charCodeAt(i);
      if (!(cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 39 || cp === 45 || cp === 95)) {
        return false;
      }
    }
    return true;
  }
  function multipartFormDataParser(input, mimeType) {
    assert(mimeType !== "failure" && mimeType.essence === "multipart/form-data");
    const boundaryString = mimeType.parameters.get("boundary");
    if (boundaryString === void 0) {
      throw parsingError("missing boundary in content-type header");
    }
    const boundary = Buffer.from(`--${boundaryString}`, "utf8");
    const entryList = [];
    const position = { position: 0 };
    while (input[position.position] === 13 && input[position.position + 1] === 10) {
      position.position += 2;
    }
    let trailing = input.length;
    while (input[trailing - 1] === 10 && input[trailing - 2] === 13) {
      trailing -= 2;
    }
    if (trailing !== input.length) {
      input = input.subarray(0, trailing);
    }
    while (true) {
      if (input.subarray(position.position, position.position + boundary.length).equals(boundary)) {
        position.position += boundary.length;
      } else {
        throw parsingError("expected a value starting with -- and the boundary");
      }
      if (position.position === input.length - 2 && bufferStartsWith(input, dd, position) || position.position === input.length - 4 && bufferStartsWith(input, ddcrlf, position)) {
        return entryList;
      }
      if (input[position.position] !== 13 || input[position.position + 1] !== 10) {
        throw parsingError("expected CRLF");
      }
      position.position += 2;
      const result = parseMultipartFormDataHeaders(input, position);
      let { name, filename, contentType, encoding } = result;
      position.position += 2;
      let body;
      {
        const boundaryIndex = input.indexOf(boundary.subarray(2), position.position);
        if (boundaryIndex === -1) {
          throw parsingError("expected boundary after body");
        }
        body = input.subarray(position.position, boundaryIndex - 4);
        position.position += body.length;
        if (encoding === "base64") {
          body = Buffer.from(body.toString(), "base64");
        }
      }
      if (input[position.position] !== 13 || input[position.position + 1] !== 10) {
        throw parsingError("expected CRLF");
      } else {
        position.position += 2;
      }
      let value;
      if (filename !== null) {
        contentType ??= "text/plain";
        if (!isAsciiString(contentType)) {
          contentType = "";
        }
        value = new File([body], filename, { type: contentType });
      } else {
        value = utf8DecodeBytes(Buffer.from(body));
      }
      assert(webidl.is.USVString(name));
      assert(typeof value === "string" && webidl.is.USVString(value) || webidl.is.File(value));
      entryList.push(makeEntry(name, value, filename));
    }
  }
  function parseMultipartFormDataHeaders(input, position) {
    let name = null;
    let filename = null;
    let contentType = null;
    let encoding = null;
    while (true) {
      if (input[position.position] === 13 && input[position.position + 1] === 10) {
        if (name === null) {
          throw parsingError("header name is null");
        }
        return { name, filename, contentType, encoding };
      }
      let headerName = collectASequenceOfBytes(
        (char) => char !== 10 && char !== 13 && char !== 58,
        input,
        position
      );
      headerName = removeChars(headerName, true, true, (char) => char === 9 || char === 32);
      if (!HTTP_TOKEN_CODEPOINTS.test(headerName.toString())) {
        throw parsingError("header name does not match the field-name token production");
      }
      if (input[position.position] !== 58) {
        throw parsingError("expected :");
      }
      position.position++;
      collectASequenceOfBytes(
        (char) => char === 32 || char === 9,
        input,
        position
      );
      switch (bufferToLowerCasedHeaderName(headerName)) {
        case "content-disposition": {
          name = filename = null;
          if (!bufferStartsWith(input, formDataNameBuffer, position)) {
            throw parsingError('expected form-data; name=" for content-disposition header');
          }
          position.position += 17;
          name = parseMultipartFormDataName(input, position);
          if (input[position.position] === 59 && input[position.position + 1] === 32) {
            const at = { position: position.position + 2 };
            if (bufferStartsWith(input, filenameBuffer, at)) {
              if (input[at.position + 8] === 42) {
                at.position += 10;
                collectASequenceOfBytes(
                  (char) => char === 32 || char === 9,
                  input,
                  at
                );
                const headerValue = collectASequenceOfBytes(
                  (char) => char !== 32 && char !== 13 && char !== 10,
                  // ' ' or CRLF
                  input,
                  at
                );
                if (headerValue[0] !== 117 && headerValue[0] !== 85 || // u or U
                headerValue[1] !== 116 && headerValue[1] !== 84 || // t or T
                headerValue[2] !== 102 && headerValue[2] !== 70 || // f or F
                headerValue[3] !== 45 || // -
                headerValue[4] !== 56) {
                  throw parsingError("unknown encoding, expected utf-8''");
                }
                filename = decodeURIComponent(new TextDecoder().decode(headerValue.subarray(7)));
                position.position = at.position;
              } else {
                position.position += 11;
                collectASequenceOfBytes(
                  (char) => char === 32 || char === 9,
                  input,
                  position
                );
                position.position++;
                filename = parseMultipartFormDataName(input, position);
              }
            }
          }
          break;
        }
        case "content-type": {
          let headerValue = collectASequenceOfBytes(
            (char) => char !== 10 && char !== 13,
            input,
            position
          );
          headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
          contentType = isomorphicDecode(headerValue);
          break;
        }
        case "content-transfer-encoding": {
          let headerValue = collectASequenceOfBytes(
            (char) => char !== 10 && char !== 13,
            input,
            position
          );
          headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
          encoding = isomorphicDecode(headerValue);
          break;
        }
        default: {
          collectASequenceOfBytes(
            (char) => char !== 10 && char !== 13,
            input,
            position
          );
        }
      }
      if (input[position.position] !== 13 && input[position.position + 1] !== 10) {
        throw parsingError("expected CRLF");
      } else {
        position.position += 2;
      }
    }
  }
  function parseMultipartFormDataName(input, position) {
    assert(input[position.position - 1] === 34);
    let name = collectASequenceOfBytes(
      (char) => char !== 10 && char !== 13 && char !== 34,
      input,
      position
    );
    if (input[position.position] !== 34) {
      throw parsingError('expected "');
    } else {
      position.position++;
    }
    name = new TextDecoder().decode(name).replace(/%0A/ig, "\n").replace(/%0D/ig, "\r").replace(/%22/g, '"');
    return name;
  }
  function collectASequenceOfBytes(condition, input, position) {
    let start = position.position;
    while (start < input.length && condition(input[start])) {
      ++start;
    }
    return input.subarray(position.position, position.position = start);
  }
  function removeChars(buf, leading, trailing, predicate) {
    let lead = 0;
    let trail = buf.length - 1;
    if (leading) {
      while (lead < buf.length && predicate(buf[lead])) lead++;
    }
    {
      while (trail > 0 && predicate(buf[trail])) trail--;
    }
    return lead === 0 && trail === buf.length - 1 ? buf : buf.subarray(lead, trail + 1);
  }
  function bufferStartsWith(buffer, start, position) {
    if (buffer.length < start.length) {
      return false;
    }
    for (let i = 0; i < start.length; i++) {
      if (start[i] !== buffer[position.position + i]) {
        return false;
      }
    }
    return true;
  }
  function parsingError(cause) {
    return new TypeError("Failed to parse body as FormData.", { cause: new TypeError(cause) });
  }
  formdataParser = {
    multipartFormDataParser,
    validateBoundary
  };
  return formdataParser;
}
export {
  requireFormdataParser as __require
};
//# sourceMappingURL=index118.js.map
