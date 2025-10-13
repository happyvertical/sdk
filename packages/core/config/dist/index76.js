import { __exports as keyword } from "./index78.js";
var hasRequiredKeyword;
function requireKeyword() {
  if (hasRequiredKeyword) return keyword;
  hasRequiredKeyword = 1;
  Object.defineProperty(keyword, "__esModule", {
    value: true
  });
  keyword.isKeyword = isKeyword;
  keyword.isReservedWord = isReservedWord;
  keyword.isStrictBindOnlyReservedWord = isStrictBindOnlyReservedWord;
  keyword.isStrictBindReservedWord = isStrictBindReservedWord;
  keyword.isStrictReservedWord = isStrictReservedWord;
  const reservedWords = {
    keyword: ["break", "case", "catch", "continue", "debugger", "default", "do", "else", "finally", "for", "function", "if", "return", "switch", "throw", "try", "var", "const", "while", "with", "new", "this", "super", "class", "extends", "export", "import", "null", "true", "false", "in", "instanceof", "typeof", "void", "delete"],
    strict: ["implements", "interface", "let", "package", "private", "protected", "public", "static", "yield"],
    strictBind: ["eval", "arguments"]
  };
  const keywords = new Set(reservedWords.keyword);
  const reservedWordsStrictSet = new Set(reservedWords.strict);
  const reservedWordsStrictBindSet = new Set(reservedWords.strictBind);
  function isReservedWord(word, inModule) {
    return inModule && word === "await" || word === "enum";
  }
  function isStrictReservedWord(word, inModule) {
    return isReservedWord(word, inModule) || reservedWordsStrictSet.has(word);
  }
  function isStrictBindOnlyReservedWord(word) {
    return reservedWordsStrictBindSet.has(word);
  }
  function isStrictBindReservedWord(word, inModule) {
    return isStrictReservedWord(word, inModule) || isStrictBindOnlyReservedWord(word);
  }
  function isKeyword(word) {
    return keywords.has(word);
  }
  return keyword;
}
export {
  requireKeyword as __require
};
//# sourceMappingURL=index76.js.map
