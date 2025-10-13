const DANGEROUS_PATTERNS = [
  /require\s*\(/i,
  // No require()
  /import\s+/i,
  // No import statements
  /eval\s*\(/i,
  // No eval()
  /Function\s*\(/i,
  // No Function constructor
  /process\./i,
  // No process access
  /fs\./i,
  // No filesystem module
  /child_process/i,
  // No child process
  /__dirname/i,
  // No directory access
  /__filename/i,
  // No file access
  /global\./i
  // No global object manipulation
];
function validateCode(code, options = {}) {
  const {
    allowedGlobals,
    disallowedPatterns = DANGEROUS_PATTERNS,
    maxLength = 5e4,
    allowRequire = false,
    allowImport = false,
    allowEval = false,
    checkSyntax = true
  } = options;
  const errors = [];
  const warnings = [];
  if (!code || code.trim().length === 0) {
    errors.push("Code is empty");
    return { valid: false, errors, warnings };
  }
  if (code.length > maxLength) {
    errors.push(
      `Code exceeds maximum length (${code.length} > ${maxLength} characters)`
    );
  }
  const patternFlags = /* @__PURE__ */ new Map([
    [DANGEROUS_PATTERNS[0], "require"],
    // /require\s*\(/i
    [DANGEROUS_PATTERNS[1], "import"],
    // /import\s+/i
    [DANGEROUS_PATTERNS[2], "eval"],
    // /eval\s*\(/i
    [DANGEROUS_PATTERNS[3], "eval"]
    // /Function\s*\(/i - also controlled by allowEval
    // Patterns 4-9 are always dangerous (process, fs, child_process, etc.)
  ]);
  const effectivePatterns = disallowedPatterns.filter((pattern, index) => {
    const patternType = patternFlags.get(DANGEROUS_PATTERNS[index]);
    if (patternType === "require" && allowRequire) {
      return false;
    }
    if (patternType === "import" && allowImport) {
      return false;
    }
    if (patternType === "eval" && allowEval) {
      return false;
    }
    return true;
  });
  for (const pattern of effectivePatterns) {
    if (pattern.test(code)) {
      errors.push(
        `Code contains disallowed pattern: ${pattern.source.replace(/\\/g, "")}`
      );
    }
  }
  if (allowedGlobals) {
    const undeclaredVars = findUndeclaredVariables(code, allowedGlobals);
    if (undeclaredVars.length > 0) {
      warnings.push(
        `Potentially undeclared variables: ${undeclaredVars.join(", ")}`
      );
    }
  }
  if (checkSyntax) {
    const syntaxErrors = checkCodeSyntax(code);
    errors.push(...syntaxErrors);
  }
  const stats = {
    length: code.length,
    lines: code.split("\n").length,
    hasAsync: /\basync\b\s*(function|\([\w\s,={}[\]]*\)\s*=>|\w+\s*\()/m.test(code),
    hasArrowFunctions: /=>/.test(code),
    hasClasses: /\bclass\s+\w+/.test(code)
  };
  if (stats.lines > 100) {
    warnings.push(`Code is long (${stats.lines} lines) - consider breaking into smaller functions`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats
  };
}
function checkCodeSyntax(code) {
  const errors = [];
  try {
    new Function(code);
  } catch (error) {
    if (error instanceof SyntaxError) {
      const message = error.message;
      if (message.includes("await is only valid") && /\bawait\b/.test(code)) {
        try {
          new Function(`(async function() { ${code} })()`);
          return errors;
        } catch (asyncError) {
          if (asyncError instanceof SyntaxError) {
            errors.push(`Syntax error: ${asyncError.message}`);
          }
        }
      } else {
        errors.push(`Syntax error: ${message}`);
      }
    }
  }
  return errors;
}
function findUndeclaredVariables(code, allowedGlobals) {
  const undeclaredVars = /* @__PURE__ */ new Set();
  const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  const matches = code.matchAll(identifierRegex);
  const declaredVars = /* @__PURE__ */ new Set();
  const declarationRegex = /\b(?:var|let|const|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const declarations = code.matchAll(declarationRegex);
  for (const match of declarations) {
    if (match[1]) {
      declaredVars.add(match[1]);
    }
  }
  for (const match of matches) {
    const identifier = match[1];
    if (isJavaScriptKeyword(identifier)) {
      continue;
    }
    if (declaredVars.has(identifier)) {
      continue;
    }
    if (allowedGlobals.includes(identifier)) {
      continue;
    }
    if (isCommonBuiltin(identifier)) {
      continue;
    }
    undeclaredVars.add(identifier);
  }
  return Array.from(undeclaredVars);
}
function isJavaScriptKeyword(word) {
  const keywords = [
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
    "async",
    "await"
  ];
  return keywords.includes(word);
}
function isCommonBuiltin(word) {
  const builtins = [
    "Array",
    "Object",
    "String",
    "Number",
    "Boolean",
    "Date",
    "Math",
    "JSON",
    "RegExp",
    "Error",
    "Map",
    "Set",
    "Promise",
    "Symbol",
    "undefined",
    "null",
    "true",
    "false",
    "console",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent"
  ];
  return builtins.includes(word);
}
function isSafeCode(code) {
  const result = validateCode(code, {
    maxLength: 5e4,
    checkSyntax: true
  });
  return result.valid;
}
export {
  isSafeCode,
  validateCode
};
//# sourceMappingURL=index4.js.map
