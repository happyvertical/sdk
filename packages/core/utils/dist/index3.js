import * as vm from "node:vm";
const DEFAULT_BUILTINS = [
  "Array",
  "Object",
  "JSON",
  "Math",
  "Date",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  "Symbol",
  "Promise"
];
function createSandbox(options = {}) {
  const {
    globals = {},
    allowedBuiltins = DEFAULT_BUILTINS,
    allowConsole = false
  } = options;
  const sandbox = /* @__PURE__ */ Object.create(null);
  for (const builtin of allowedBuiltins) {
    if (builtin in globalThis) {
      sandbox[builtin] = globalThis[builtin];
    }
  }
  if (allowConsole) {
    sandbox.console = console;
  }
  Object.assign(sandbox, globals);
  return vm.createContext(sandbox);
}
function executeCode(code, sandbox, options = {}) {
  const {
    timeout = 5e3,
    filename = "generated-code.js",
    captureResult = true
  } = options;
  try {
    let wrappedCode;
    if (captureResult) {
      const hasMultipleStatements = code.includes(";") || code.includes("\n") && code.trim().split("\n").length > 1;
      const hasFunctionDef = /function\s+\w+|const\s+\w+\s*=\s*function|const\s+\w+\s*=\s*\(/i.test(code);
      if (hasMultipleStatements || hasFunctionDef) {
        wrappedCode = code;
      } else {
        wrappedCode = `(function() { return (${code}); })();`;
      }
    } else {
      wrappedCode = code;
    }
    const result = vm.runInContext(wrappedCode, sandbox, {
      timeout,
      filename,
      displayErrors: true
    });
    return result;
  } catch (error) {
    if (error instanceof Error) {
      const message = `Code execution failed: ${error.message}`;
      const enhancedError = new Error(message);
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
    throw error;
  }
}
async function executeCodeAsync(code, sandbox, options = {}) {
  const {
    timeout = 5e3,
    filename = "generated-code.js",
    captureResult = true
  } = options;
  try {
    let wrappedCode;
    if (captureResult) {
      const trimmedCode = code.trim();
      const lines = trimmedCode.split("\n");
      if (lines.length > 1 || trimmedCode.includes(";")) {
        const statements = trimmedCode.split("\n").filter((line) => line.trim());
        const lastLine = statements[statements.length - 1];
        const otherLines = statements.slice(0, -1);
        if (lastLine.trim().startsWith("return ")) {
          wrappedCode = `(async function() {
            ${trimmedCode}
          })();`;
        } else {
          const lastExpression = lastLine.trim().replace(/;$/, "");
          wrappedCode = `(async function() {
            ${otherLines.join("\n")}
            return ${lastExpression};
          })();`;
        }
      } else {
        wrappedCode = `(async function() {
          return (${trimmedCode});
        })();`;
      }
    } else {
      wrappedCode = `(async function() {
        ${code}
      })();`;
    }
    const result = await vm.runInContext(wrappedCode, sandbox, {
      timeout,
      filename,
      displayErrors: true
    });
    return result;
  } catch (error) {
    if (error instanceof Error) {
      const message = `Async code execution failed: ${error.message}`;
      const enhancedError = new Error(message);
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
    throw error;
  }
}
function executeInSandbox(code, options = {}) {
  const sandbox = createSandbox(options);
  return executeCode(code, sandbox, options);
}
async function executeInSandboxAsync(code, options = {}) {
  const sandbox = createSandbox(options);
  return executeCodeAsync(code, sandbox, options);
}
export {
  createSandbox,
  executeCode,
  executeCodeAsync,
  executeInSandbox,
  executeInSandboxAsync
};
//# sourceMappingURL=index3.js.map
