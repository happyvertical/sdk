#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getAI } from "@have/ai";
import { dirname, join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_KEYWORDS = {
  ai: [
    "ai",
    "llm",
    "gpt",
    "claude",
    "openai",
    "anthropic",
    "model",
    "completion",
    "chat",
    "embedding",
    "gemini",
    "bedrock",
    "huggingface"
  ],
  sql: [
    "database",
    "sql",
    "sqlite",
    "postgres",
    "duckdb",
    "query",
    "table",
    "schema",
    "json"
  ],
  files: [
    "file",
    "filesystem",
    "read",
    "write",
    "download",
    "upload",
    "path",
    "storage"
  ],
  spider: [
    "crawl",
    "scrape",
    "web",
    "html",
    "website",
    "page",
    "link",
    "civicweb"
  ],
  pdf: ["pdf", "document", "extract", "parse", "acrobat"],
  ocr: ["ocr", "image", "text extraction", "tesseract", "vision"],
  geo: ["location", "map", "coordinates", "geocode", "address", "gis"],
  translator: ["translate", "language", "translation", "localization"],
  utils: ["id", "uuid", "slug", "date", "format", "utility", "helper"],
  cache: ["cache", "caching", "redis", "memory", "store"],
  logger: ["log", "logging", "logger", "debug", "error"],
  documents: ["document processing", "content extraction", "analysis"]
};
const packageCache = /* @__PURE__ */ new Map();
function getSDKRoot() {
  return join(__dirname, "..", "..", "..");
}
function extractDescription(content) {
  const purposeMatch = content.match(
    /##\s+Purpose and Responsibilities\s+([^\n]+(?:\n(?!##)[^\n]+)*)/i
  );
  if (purposeMatch) {
    const purpose = purposeMatch[1].trim().replace(/\n/g, " ").replace(/\s+/g, " ");
    const firstSentence = purpose.match(/^[^.!?]+[.!?]/);
    if (firstSentence) {
      return firstSentence[0].trim();
    }
    return purpose.substring(0, 200).trim() + "...";
  }
  const lines = content.split("\n");
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ") || line.startsWith("## ")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim().length > 0 && !line.startsWith("#")) {
      return line.trim();
    }
  }
  return "No description available";
}
async function buildPackageRegistry() {
  if (packageCache.size > 0) {
    return packageCache;
  }
  const sdkRoot = getSDKRoot();
  const packagesDir = join(sdkRoot, "packages");
  try {
    const entries = await readdir(packagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageName = entry.name;
      const claudeMdPath = join(packagesDir, packageName, "CLAUDE.md");
      try {
        const claudeMd = await readFile(claudeMdPath, "utf-8");
        const description = extractDescription(claudeMd);
        const keywords = PACKAGE_KEYWORDS[packageName] || [];
        packageCache.set(packageName, {
          name: packageName,
          path: join(packagesDir, packageName),
          description,
          claudeMd,
          keywords
        });
      } catch (error) {
        continue;
      }
    }
    return packageCache;
  } catch (error) {
    throw new Error(
      `Failed to build package registry: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
async function getPackage(name) {
  const registry = await buildPackageRegistry();
  return registry.get(name);
}
async function getAllPackages() {
  const registry = await buildPackageRegistry();
  return Array.from(registry.values());
}
async function getPackageDocs(name) {
  const pkg = await getPackage(name);
  return pkg?.claudeMd;
}
function extractQueryKeywords(query) {
  return query.toLowerCase().split(/\W+/).filter((word) => word.length > 2);
}
function calculateScore(queryKeywords, packageKeywords) {
  const matched = [];
  let score = 0;
  for (const queryKeyword of queryKeywords) {
    for (const packageKeyword of packageKeywords) {
      if (queryKeyword === packageKeyword) {
        score += 10;
        matched.push(packageKeyword);
      } else if (queryKeyword.includes(packageKeyword) || packageKeyword.includes(queryKeyword)) {
        score += 5;
        if (!matched.includes(packageKeyword)) {
          matched.push(packageKeyword);
        }
      }
    }
  }
  for (const queryKeyword of queryKeywords) {
    if (packageKeywords.some((pkg) => pkg.toLowerCase() === queryKeyword)) {
      score += 15;
    }
  }
  return { score, matched };
}
async function routeQuery(query, minScore = 5) {
  const packages = await getAllPackages();
  const queryKeywords = extractQueryKeywords(query);
  const matches = [];
  for (const pkg of packages) {
    const { score, matched } = calculateScore(queryKeywords, pkg.keywords);
    if (score >= minScore) {
      matches.push({
        package: pkg,
        score,
        matchedKeywords: matched
      });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}
async function getPackagesByNames(names) {
  const packages = await getAllPackages();
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  return packages.filter((pkg) => nameSet.has(pkg.name.toLowerCase()));
}
async function getAIClient() {
  try {
    return await getAI({});
  } catch (error) {
    throw new Error(
      `AI client initialization failed. Please configure AI provider using HAVE_AI_* environment variables. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function buildContext(packages) {
  if (packages.length === 0) {
    return "No relevant packages found.";
  }
  const contextParts = [];
  for (const pkg of packages) {
    contextParts.push(
      `## Package: @have/${pkg.name}

${pkg.claudeMd}

---
`
    );
  }
  return contextParts.join("\n");
}
async function ask(input) {
  const { query, packages: requestedPackages } = input;
  try {
    let packages;
    if (requestedPackages && requestedPackages.length > 0) {
      packages = await getPackagesByNames(requestedPackages);
      if (packages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `None of the requested packages (${requestedPackages.join(", ")}) were found. Use list-packages to see available packages.`
            }
          ],
          isError: true
        };
      }
    } else {
      const matches = await routeQuery(query);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant packages found for query: "${query}". Try using list-packages to browse available packages or specify packages explicitly.`
            }
          ],
          isError: false
        };
      }
      packages = matches.slice(0, 3).map((m) => m.package);
    }
    const context = buildContext(packages);
    const ai = await getAIClient();
    const systemPrompt = `You are an expert SDK documentation assistant for the HAppy VErtical (HAVE) SDK.
You have access to the full documentation (CLAUDE.md files) for the following packages: ${packages.map((p) => `@have/${p.name}`).join(", ")}.

Your role is to:
1. Answer questions about the SDK using the provided package documentation
2. Provide code examples when relevant
3. Reference specific packages and documentation sections
4. Be concise but thorough
5. Include package names in your response (e.g., "@have/ai", "@have/sql")

Use the documentation provided below to answer the user's question accurately.

---
${context}
---`;
    const response = await ai.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      {
        temperature: 0.7,
        maxTokens: 2e3
      }
    );
    const packageList = packages.map((p) => `@have/${p.name}`).join(", ");
    const footer = `

---
*Consulted packages: ${packageList}*`;
    return {
      content: [
        {
          type: "text",
          text: response.content + footer
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error processing query: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}
async function listPackages() {
  const packages = await getAllPackages();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            packages: packages.map((pkg) => ({
              name: pkg.name,
              description: pkg.description,
              keywords: pkg.keywords
            })),
            total: packages.length
          },
          null,
          2
        )
      }
    ]
  };
}
async function getDocs(packageName) {
  const docs = await getPackageDocs(packageName);
  if (!docs) {
    return {
      content: [
        {
          type: "text",
          text: `Package "${packageName}" not found. Use list-packages to see available packages.`
        }
      ],
      isError: true
    };
  }
  return {
    content: [
      {
        type: "text",
        text: docs
      }
    ]
  };
}
class SDKMCPServer {
  server;
  constructor() {
    this.server = new Server(
      {
        name: "sdk-mcp",
        version: "0.1.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.setupToolHandlers();
    this.setupErrorHandling();
  }
  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "ask",
          description: "Ask a question about the HAVE SDK. Automatically routes your query to relevant package experts (CLAUDE.md files) and synthesizes a response using AI.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Your question about SDK usage or capabilities"
              },
              packages: {
                type: "array",
                items: { type: "string" },
                description: 'Optional: Specific packages to consult (e.g., ["ai", "sql"])'
              }
            },
            required: ["query"]
          }
        },
        {
          name: "list-packages",
          description: "List all available SDK packages with their descriptions and keywords",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "get-docs",
          description: "Get the full CLAUDE.md documentation for a specific package",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: 'Name of the package (e.g., "ai", "sql", "spider")'
              }
            },
            required: ["packageName"]
          }
        }
      ]
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "ask": {
            const input = request.params.arguments ?? {};
            return await ask(input);
          }
          case "list-packages": {
            return await listPackages();
          }
          case "get-docs": {
            const args = request.params.arguments ?? {};
            return await getDocs(args.packageName);
          }
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    });
  }
  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SDK MCP Server running on stdio");
  }
}
const server = new SDKMCPServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
