function extractCodeBlock(text, language) {
  if (!text) {
    return "";
  }
  const langPattern = language ? `${language}\\s*` : "(?:\\w+\\s*)?";
  const codeBlockRegex = new RegExp(
    `\`\`\`${langPattern}\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``,
    "i"
  );
  const match = text.match(codeBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  const inlineRegex = /`([^`]+)`/;
  const inlineMatch = text.match(inlineRegex);
  if (inlineMatch && inlineMatch[1]) {
    return inlineMatch[1].trim();
  }
  return "";
}
function extractJSON(text) {
  if (!text) {
    throw new SyntaxError("Cannot extract JSON from empty text");
  }
  let jsonText = extractCodeBlock(text, "json");
  if (!jsonText) {
    jsonText = extractCodeBlock(text);
  }
  if (!jsonText) {
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
    } else if (jsonArrayMatch) {
      jsonText = jsonArrayMatch[0];
    } else {
      jsonText = text.trim();
    }
  }
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new SyntaxError(
      `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
function extractAllCodeBlocks(text, language) {
  if (!text) {
    return [];
  }
  const langPattern = language ? `${language}\\s*` : "(?:\\w+\\s*)?";
  const codeBlockRegex = new RegExp(
    `\`\`\`${langPattern}\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``,
    "gi"
  );
  const blocks = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match[1]) {
      blocks.push(match[1].trim());
    }
  }
  return blocks;
}
function extractFunctionDefinition(code, functionName) {
  if (!code || !functionName) {
    return "";
  }
  const patterns = [
    // function foo() { ... }
    {
      regex: new RegExp(
        `function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
        "i"
      ),
      hasBraces: true
    },
    // const foo = function() { ... }
    {
      regex: new RegExp(
        `(?:const|let|var)\\s+${functionName}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`,
        "i"
      ),
      hasBraces: true
    },
    // const foo = () => { ... }
    {
      regex: new RegExp(
        `(?:const|let|var)\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
        "i"
      ),
      hasBraces: true
    },
    // const foo = () => ... (no braces)
    {
      regex: new RegExp(
        `(?:const|let|var)\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*[^;]+;?`,
        "i"
      ),
      hasBraces: false
    }
  ];
  for (const { regex, hasBraces } of patterns) {
    const match = code.match(regex);
    if (match && match.index !== void 0) {
      const startIdx = match.index;
      if (!hasBraces) {
        return match[0].trim();
      }
      const braceIdx = code.indexOf("{", startIdx);
      if (braceIdx === -1) continue;
      let idx = braceIdx;
      let depth = 0;
      let endIdx = -1;
      while (idx < code.length) {
        const char = code[idx];
        if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;
          if (depth === 0) {
            endIdx = idx;
            break;
          }
        }
        idx++;
      }
      if (endIdx !== -1) {
        return code.slice(startIdx, endIdx + 1).trim();
      }
    }
  }
  return "";
}
export {
  extractAllCodeBlocks,
  extractCodeBlock,
  extractFunctionDefinition,
  extractJSON
};
//# sourceMappingURL=index2.js.map
