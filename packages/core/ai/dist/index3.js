import { ValidationError } from "@have/utils";
function isOpenAIOptions(options) {
  return !options.type || options.type === "openai";
}
function isGeminiOptions(options) {
  return options.type === "gemini";
}
function isAnthropicOptions(options) {
  return options.type === "anthropic";
}
function isHuggingFaceOptions(options) {
  return options.type === "huggingface";
}
function isBedrockOptions(options) {
  return options.type === "bedrock";
}
async function getAI(options) {
  if (isOpenAIOptions(options)) {
    const { OpenAIProvider } = await import("./index7.js");
    return new OpenAIProvider(options);
  }
  if (isGeminiOptions(options)) {
    const { GeminiProvider } = await import("./index8.js");
    return new GeminiProvider(options);
  }
  if (isAnthropicOptions(options)) {
    const { AnthropicProvider } = await import("./index9.js");
    return new AnthropicProvider(options);
  }
  if (isHuggingFaceOptions(options)) {
    const { HuggingFaceProvider } = await import("./index10.js");
    return new HuggingFaceProvider(options);
  }
  if (isBedrockOptions(options)) {
    const { BedrockProvider } = await import("./index11.js");
    return new BedrockProvider(options);
  }
  throw new ValidationError("Unsupported AI provider type", {
    supportedTypes: ["openai", "gemini", "anthropic", "huggingface", "bedrock"],
    providedType: options.type
  });
}
async function getAIAuto(options) {
  if (options.apiKey && !options.type) {
    return getAI({ ...options, type: "openai" });
  }
  if (options.apiToken) {
    return getAI({ ...options, type: "huggingface" });
  }
  if (options.region && options.credentials) {
    return getAI({ ...options, type: "bedrock" });
  }
  if (options.projectId || options.anthropicVersion) {
    if (options.anthropicVersion) {
      return getAI({ ...options, type: "anthropic" });
    }
    if (options.projectId) {
      return getAI({ ...options, type: "gemini" });
    }
  }
  throw new ValidationError("Could not auto-detect AI provider from options", {
    hint: 'Please specify a "type" field in options or provide provider-specific credentials',
    supportedTypes: ["openai", "gemini", "anthropic", "huggingface", "bedrock"],
    providedOptions: Object.keys(options)
  });
}
export {
  getAI,
  getAIAuto
};
//# sourceMappingURL=index3.js.map
