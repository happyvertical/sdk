import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { AIError, AuthenticationError, RateLimitError, ContextLengthError } from "../index.js";
const execAsync = promisify(exec);
class ClaudeCliProvider {
  options;
  cliPath = null;
  /**
   * Creates a new Claude CLI provider instance
   * @param options - Configuration options for the Claude CLI provider
   */
  constructor(options) {
    this.options = {
      defaultModel: "sonnet",
      ...options
    };
  }
  /**
   * Finds the Claude CLI binary in PATH or uses custom cliPath
   * @throws {AIError} When CLI cannot be found
   * @private
   */
  async findCli() {
    if (this.cliPath) {
      return this.cliPath;
    }
    if (this.options.cliPath) {
      try {
        await execAsync(`"${this.options.cliPath}" --help`);
        this.cliPath = this.options.cliPath;
        return this.cliPath;
      } catch (_error) {
        throw new AIError(
          `Claude CLI not found at specified path: ${this.options.cliPath}`,
          "CLI_NOT_FOUND",
          "claude-cli"
        );
      }
    }
    const commonPaths = [
      `${process.env.HOME}/.claude/local/claude`,
      // Default installation path
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude"
    ];
    for (const path of commonPaths) {
      try {
        await execAsync(`"${path}" --help`);
        this.cliPath = path;
        return this.cliPath;
      } catch (_error) {
      }
    }
    try {
      const { stdout } = await execAsync('bash -c "type -p claude"');
      const path = stdout.trim();
      if (path) {
        this.cliPath = path;
        return this.cliPath;
      }
    } catch (_error) {
    }
    try {
      const { stdout } = await execAsync("which claude");
      this.cliPath = stdout.trim();
      return this.cliPath;
    } catch (_error) {
    }
    throw new AIError(
      "Claude CLI not found. Please install Claude Code CLI or specify cliPath option. Visit https://docs.claude.com/en/docs/claude-code/ for installation instructions.",
      "CLI_NOT_FOUND",
      "claude-cli"
    );
  }
  /**
   * Normalizes model name to full model ID or short name
   * @private
   */
  normalizeModel(model) {
    const m = model || this.options.defaultModel || "sonnet";
    const modelMap = {
      sonnet: "sonnet",
      opus: "opus",
      haiku: "haiku"
    };
    return modelMap[m] || m;
  }
  /**
   * Execute Claude CLI command and return parsed JSON output
   * @private
   */
  async executeCommand(prompt, options = {}) {
    const cliPath = await this.findCli();
    const model = this.normalizeModel(options.model);
    const args = ["--print", "--output-format", "json", "--model", model];
    if (options.systemPrompt) {
      args.push("--system-prompt", options.systemPrompt);
    }
    args.push(prompt);
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(cliPath, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("error", (error) => {
        reject(
          new AIError(
            `Failed to execute Claude CLI: ${error.message}`,
            "EXECUTION_ERROR",
            "claude-cli"
          )
        );
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(this.mapCliError(stderr, code || void 0));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          reject(
            new AIError(
              "Failed to parse CLI output as JSON",
              "PARSE_ERROR",
              "claude-cli"
            )
          );
        }
      });
    });
  }
  /**
   * Execute Claude CLI command with streaming output
   * @private
   */
  async *executeStreamingCommand(prompt, options = {}) {
    const cliPath = await this.findCli();
    const model = this.normalizeModel(options.model);
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      // Required for stream-json format
      "--model",
      model
    ];
    if (options.systemPrompt) {
      args.push("--system-prompt", options.systemPrompt);
    }
    args.push(prompt);
    const child = spawn(cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    let buffer = "";
    for await (const chunk of child.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "assistant" && parsed.message?.content) {
              for (const contentBlock of parsed.message.content) {
                if (contentBlock.type === "text" && contentBlock.text) {
                  const text = contentBlock.text;
                  if (options.onProgress) {
                    options.onProgress(text);
                  }
                  yield text;
                }
              }
            } else if (parsed.type === "result" && parsed.result) {
              const text = parsed.result;
              if (options.onProgress) {
                options.onProgress(text);
              }
              yield text;
            }
          } catch (_error) {
          }
        }
      }
    }
    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code || 0));
    });
    if (exitCode !== 0) {
      throw this.mapCliError(stderr, exitCode);
    }
  }
  /**
   * Maps messages to a single prompt for CLI
   * @private
   */
  mapMessagesToPrompt(messages) {
    let systemPrompt;
    const conversationParts = [];
    for (const message of messages) {
      if (message.role === "system") {
        systemPrompt = systemPrompt ? `${systemPrompt}

${message.content}` : message.content;
      } else if (message.role === "user") {
        conversationParts.push(`User: ${message.content}`);
      } else if (message.role === "assistant") {
        conversationParts.push(`Assistant: ${message.content}`);
      }
    }
    if (conversationParts.length === 1 && conversationParts[0].startsWith("User: ")) {
      return {
        prompt: conversationParts[0].substring(6),
        // Remove "User: " prefix
        systemPrompt
      };
    }
    return {
      prompt: conversationParts.join("\n\n"),
      systemPrompt
    };
  }
  /**
   * Maps CLI errors to standardized error types
   * @private
   */
  mapCliError(stderr, exitCode) {
    const errorText = stderr.toLowerCase();
    if (errorText.includes("not authenticated") || errorText.includes("login required")) {
      return new AuthenticationError("claude-cli");
    }
    if (errorText.includes("rate limit") || errorText.includes("too many requests")) {
      return new RateLimitError("claude-cli");
    }
    if (errorText.includes("context length") || errorText.includes("too long")) {
      return new ContextLengthError("claude-cli");
    }
    return new AIError(
      `Claude CLI error (exit code ${exitCode}): ${stderr}`,
      "CLI_ERROR",
      "claude-cli"
    );
  }
  /**
   * Generate a chat completion using Claude CLI
   * @param messages - Array of conversation messages
   * @param options - Optional configuration for the chat completion
   * @returns Promise resolving to the AI response with content and metadata
   * @throws {AIError} When the CLI execution fails
   *
   * @example
   * ```typescript
   * const response = await provider.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Explain quantum computing' }
   * ], {
   *   model: 'sonnet'
   * });
   * ```
   */
  async chat(messages, options = {}) {
    const { prompt, systemPrompt } = this.mapMessagesToPrompt(messages);
    const result = await this.executeCommand(prompt, {
      model: options.model,
      systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    });
    return {
      content: result.result || result.content || result.text || JSON.stringify(result),
      model: options.model || this.options.defaultModel,
      finishReason: result.is_error ? "stop" : "stop",
      // Extract usage from CLI response if available
      usage: result.usage ? {
        promptTokens: result.usage.input_tokens || 0,
        completionTokens: result.usage.output_tokens || 0,
        totalTokens: (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0)
      } : void 0
    };
  }
  /**
   * Generate a text completion (delegates to chat)
   */
  async complete(prompt, options = {}) {
    return this.chat([{ role: "user", content: prompt }], {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      n: options.n,
      stop: options.stop,
      stream: options.stream,
      onProgress: options.onProgress
    });
  }
  /**
   * Embeddings are not supported by Claude CLI
   */
  async embed(_text, _options = {}) {
    throw new AIError(
      "Claude CLI does not support embeddings. Use OpenAI or another provider for embeddings.",
      "NOT_SUPPORTED",
      "claude-cli"
    );
  }
  /**
   * Stream chat completion using Claude CLI
   */
  async *stream(messages, options = {}) {
    const { prompt, systemPrompt } = this.mapMessagesToPrompt(messages);
    yield* this.executeStreamingCommand(prompt, {
      model: options.model,
      systemPrompt,
      onProgress: options.onProgress
    });
  }
  /**
   * Count tokens in text (approximation)
   */
  async countTokens(text) {
    return Math.ceil(text.length / 3.5);
  }
  /**
   * Get available models (static list of Claude models)
   */
  async getModels() {
    return [
      {
        id: "sonnet",
        name: "Claude Sonnet",
        description: "Balanced Claude model via CLI",
        contextLength: 2e5,
        capabilities: ["text", "chat", "vision"],
        supportsFunctions: false,
        supportsVision: false
      },
      {
        id: "opus",
        name: "Claude Opus",
        description: "Most powerful Claude model via CLI",
        contextLength: 2e5,
        capabilities: ["text", "chat"],
        supportsFunctions: false,
        supportsVision: false
      },
      {
        id: "haiku",
        name: "Claude Haiku",
        description: "Fast Claude model via CLI",
        contextLength: 2e5,
        capabilities: ["text", "chat"],
        supportsFunctions: false,
        supportsVision: false
      }
    ];
  }
  /**
   * Get provider capabilities
   */
  async getCapabilities() {
    return {
      chat: true,
      completion: true,
      embeddings: false,
      // Claude CLI doesn't support embeddings
      streaming: true,
      functions: false,
      // Not supported via CLI
      vision: false,
      // Not supported in current CLI version
      fineTuning: false,
      maxContextLength: 2e5,
      supportedOperations: ["chat", "completion", "streaming"]
    };
  }
}
export {
  ClaudeCliProvider
};
//# sourceMappingURL=claude-cli-NeVjiZXv.js.map
