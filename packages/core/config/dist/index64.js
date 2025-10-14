import { __exports as jsTokens } from "./index72.js";
var hasRequiredJsTokens;
function requireJsTokens() {
  if (hasRequiredJsTokens) return jsTokens;
  hasRequiredJsTokens = 1;
  Object.defineProperty(jsTokens, "__esModule", {
    value: true
  });
  jsTokens.default = /((['"])(?:(?!\2|\\).|\\(?:\r\n|[\s\S]))*(\2)?|`(?:[^`\\$]|\\[\s\S]|\$(?!\{)|\$\{(?:[^{}]|\{[^}]*\}?)*\}?)*(`)?)|(\/\/.*)|(\/\*(?:[^*]|\*(?!\/))*(\*\/)?)|(\/(?!\*)(?:\[(?:(?![\]\\]).|\\.)*\]|(?![\/\]\\]).|\\.)+\/(?:(?!\s*(?:\b|[\u0080-\uFFFF$\\'"~({]|[+\-!](?!=)|\.?\d))|[gmiyus]{1,6}\b(?![\u0080-\uFFFF$\\]|\s*(?:[+\-*%&|^<>!=?({]|\/(?![\/*])))))|(0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)|((?!\d)(?:(?!\s)[$\w\u0080-\uFFFF]|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+)|(--|\+\+|&&|\|\||=>|\.{3}|(?:[+\-\/%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2})=?|[?~.,:;[\](){}])|(\s+)|(^$|[\s\S])/g;
  jsTokens.matchToToken = function(match) {
    var token = { type: "invalid", value: match[0], closed: void 0 };
    if (match[1]) token.type = "string", token.closed = !!(match[3] || match[4]);
    else if (match[5]) token.type = "comment";
    else if (match[6]) token.type = "comment", token.closed = !!match[7];
    else if (match[8]) token.type = "regex";
    else if (match[9]) token.type = "number";
    else if (match[10]) token.type = "name";
    else if (match[11]) token.type = "punctuator";
    else if (match[12]) token.type = "whitespace";
    return token;
  };
  return jsTokens;
}
export {
  requireJsTokens as __require
};
//# sourceMappingURL=index64.js.map
