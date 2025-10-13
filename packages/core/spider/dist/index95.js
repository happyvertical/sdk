import { __require as requireConstants } from "./index115.js";
import { __require as requireUtil } from "./index96.js";
import { __require as requireDataUrl } from "./index55.js";
import require$$0 from "node:assert";
import require$$5 from "node:querystring";
var parse;
var hasRequiredParse;
function requireParse() {
  if (hasRequiredParse) return parse;
  hasRequiredParse = 1;
  const { maxNameValuePairSize, maxAttributeValueSize } = requireConstants();
  const { isCTLExcludingHtab } = requireUtil();
  const { collectASequenceOfCodePointsFast } = requireDataUrl();
  const assert = require$$0;
  const { unescape: qsUnescape } = require$$5;
  function parseSetCookie(header) {
    if (isCTLExcludingHtab(header)) {
      return null;
    }
    let nameValuePair = "";
    let unparsedAttributes = "";
    let name = "";
    let value = "";
    if (header.includes(";")) {
      const position = { position: 0 };
      nameValuePair = collectASequenceOfCodePointsFast(";", header, position);
      unparsedAttributes = header.slice(position.position);
    } else {
      nameValuePair = header;
    }
    if (!nameValuePair.includes("=")) {
      value = nameValuePair;
    } else {
      const position = { position: 0 };
      name = collectASequenceOfCodePointsFast(
        "=",
        nameValuePair,
        position
      );
      value = nameValuePair.slice(position.position + 1);
    }
    name = name.trim();
    value = value.trim();
    if (name.length + value.length > maxNameValuePairSize) {
      return null;
    }
    return {
      name,
      value: qsUnescape(value),
      ...parseUnparsedAttributes(unparsedAttributes)
    };
  }
  function parseUnparsedAttributes(unparsedAttributes, cookieAttributeList = {}) {
    if (unparsedAttributes.length === 0) {
      return cookieAttributeList;
    }
    assert(unparsedAttributes[0] === ";");
    unparsedAttributes = unparsedAttributes.slice(1);
    let cookieAv = "";
    if (unparsedAttributes.includes(";")) {
      cookieAv = collectASequenceOfCodePointsFast(
        ";",
        unparsedAttributes,
        { position: 0 }
      );
      unparsedAttributes = unparsedAttributes.slice(cookieAv.length);
    } else {
      cookieAv = unparsedAttributes;
      unparsedAttributes = "";
    }
    let attributeName = "";
    let attributeValue = "";
    if (cookieAv.includes("=")) {
      const position = { position: 0 };
      attributeName = collectASequenceOfCodePointsFast(
        "=",
        cookieAv,
        position
      );
      attributeValue = cookieAv.slice(position.position + 1);
    } else {
      attributeName = cookieAv;
    }
    attributeName = attributeName.trim();
    attributeValue = attributeValue.trim();
    if (attributeValue.length > maxAttributeValueSize) {
      return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
    }
    const attributeNameLowercase = attributeName.toLowerCase();
    if (attributeNameLowercase === "expires") {
      const expiryTime = new Date(attributeValue);
      cookieAttributeList.expires = expiryTime;
    } else if (attributeNameLowercase === "max-age") {
      const charCode = attributeValue.charCodeAt(0);
      if ((charCode < 48 || charCode > 57) && attributeValue[0] !== "-") {
        return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
      }
      if (!/^\d+$/.test(attributeValue)) {
        return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
      }
      const deltaSeconds = Number(attributeValue);
      cookieAttributeList.maxAge = deltaSeconds;
    } else if (attributeNameLowercase === "domain") {
      let cookieDomain = attributeValue;
      if (cookieDomain[0] === ".") {
        cookieDomain = cookieDomain.slice(1);
      }
      cookieDomain = cookieDomain.toLowerCase();
      cookieAttributeList.domain = cookieDomain;
    } else if (attributeNameLowercase === "path") {
      let cookiePath = "";
      if (attributeValue.length === 0 || attributeValue[0] !== "/") {
        cookiePath = "/";
      } else {
        cookiePath = attributeValue;
      }
      cookieAttributeList.path = cookiePath;
    } else if (attributeNameLowercase === "secure") {
      cookieAttributeList.secure = true;
    } else if (attributeNameLowercase === "httponly") {
      cookieAttributeList.httpOnly = true;
    } else if (attributeNameLowercase === "samesite") {
      let enforcement = "Default";
      const attributeValueLowercase = attributeValue.toLowerCase();
      if (attributeValueLowercase.includes("none")) {
        enforcement = "None";
      }
      if (attributeValueLowercase.includes("strict")) {
        enforcement = "Strict";
      }
      if (attributeValueLowercase.includes("lax")) {
        enforcement = "Lax";
      }
      cookieAttributeList.sameSite = enforcement;
    } else {
      cookieAttributeList.unparsed ??= [];
      cookieAttributeList.unparsed.push(`${attributeName}=${attributeValue}`);
    }
    return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
  }
  parse = {
    parseSetCookie,
    parseUnparsedAttributes
  };
  return parse;
}
export {
  requireParse as __require
};
//# sourceMappingURL=index95.js.map
