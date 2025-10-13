import { ValidationError, ApiError } from "@have/utils";
import OpenAI from "openai";
function isOpenAIClientOptions(options) {
  return options.type === "openai" && "apiKey" in options && !!options.apiKey;
}
function isAIClientInstance(value) {
  return value instanceof AIClient;
}
class AIClient {
  /**
   * Configuration options for this client
   */
  options;
  /**
   * Creates a new AIClient
   *
   * @param options - Client configuration options
   */
  constructor(options) {
    this.options = options;
  }
  /**
   * Sends a message to the AI
   * Base implementation returns a placeholder response
   *
   * @param text - Message text
   * @param options - Message options
   * @returns Promise resolving to a placeholder response
   */
  async message(_text, _options = { role: "user" }) {
    return "not a real ai message, this is the base class!";
  }
  /**
   * Factory method to create appropriate AI client based on options
   *
   * @param options - Client configuration options
   * @returns Promise resolving to an initialized AI client
   * @throws Error if client type is invalid
   */
  static async create(options) {
    if (isAIClientInstance(options)) {
      return options;
    }
    const clientOptions = options;
    if (isOpenAIClientOptions(clientOptions)) {
      return OpenAIClient.create(clientOptions);
    }
    const providedType = clientOptions.type;
    if (providedType && providedType !== "openai") {
      const { getAI } = await import("./index3.js");
      return await getAI(clientOptions);
    }
    if (providedType === "openai") {
      throw new ValidationError(
        "OpenAI API key is required but missing or empty",
        {
          supportedTypes: [
            "openai",
            "anthropic",
            "gemini",
            "bedrock",
            "huggingface"
          ],
          providedType,
          hint: "Set OPENAI_API_KEY environment variable or pass apiKey in options"
        }
      );
    }
    throw new ValidationError("Invalid client type specified", {
      supportedTypes: [
        "openai",
        "anthropic",
        "gemini",
        "bedrock",
        "huggingface"
      ],
      providedType
    });
  }
  /**
   * Gets a text completion from the AI
   * In base class, delegates to message method
   *
   * @param text - Input text for completion
   * @param options - Completion options
   * @returns Promise resolving to the completion result
   */
  textCompletion(text, options = {
    role: "user"
  }) {
    return this.message(text, options);
  }
}
async function getOpenAI(options) {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl
  });
}
class OpenAIClient extends AIClient {
  /**
   * OpenAI client instance
   */
  openai;
  /**
   * Configuration options for this client
   */
  options;
  /**
   * Creates a new OpenAIClient
   *
   * @param options - OpenAI client configuration options
   */
  constructor(options) {
    super(options);
    this.options = options;
  }
  /**
   * Sends a message to OpenAI
   *
   * @param text - Message text
   * @param options - Message options
   * @returns Promise resolving to the OpenAI response
   */
  async message(text, options = { role: "user" }) {
    const response = await this.textCompletion(text, options);
    return response;
  }
  /**
   * Factory method to create and initialize an OpenAIClient
   *
   * @param options - OpenAI client configuration options
   * @returns Promise resolving to an initialized OpenAIClient
   */
  static async create(options) {
    const client = new OpenAIClient(options);
    await client.initialize();
    return client;
  }
  /**
   * Initializes the OpenAI client
   */
  async initialize() {
    this.openai = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: this.options.baseUrl
    });
  }
  /**
   * Sends a text completion request to the OpenAI API
   *
   * @param message - The message to send
   * @param options - Configuration options for the completion request
   * @returns Promise resolving to the completion text
   * @throws Error if the OpenAI API response is invalid
   */
  async textCompletion(message, options = {}) {
    const {
      model = "gpt-4o",
      role = "user",
      history = [],
      name: _name,
      frequencyPenalty: frequency_penalty = 0,
      logitBias: logit_bias,
      logprobs = false,
      topLogprobs: top_logprobs,
      maxTokens: max_tokens,
      n = 1,
      presencePenalty: presence_penalty = 0,
      responseFormat: response_format,
      seed,
      stop,
      stream: _stream = false,
      temperature = 1,
      topProbability: top_p = 1,
      tools,
      toolChoice: tool_choice,
      user,
      onProgress
    } = options;
    const messages = [
      ...history,
      {
        role,
        content: message
      }
    ];
    if (onProgress) {
      const stream = await this.openai.chat.completions.create({
        model,
        messages,
        stream: true,
        frequency_penalty,
        logit_bias,
        logprobs,
        top_logprobs,
        max_tokens,
        n,
        presence_penalty,
        response_format,
        seed,
        stop,
        temperature,
        top_p,
        tools,
        tool_choice,
        user
      });
      let fullContent = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullContent += content;
        onProgress(content);
      }
      return fullContent;
    }
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      frequency_penalty,
      logit_bias,
      logprobs,
      top_logprobs,
      max_tokens,
      n,
      presence_penalty,
      response_format,
      seed,
      stop,
      stream: false,
      temperature,
      top_p,
      tools,
      tool_choice,
      user
    });
    const choice = response.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw new ApiError("Invalid response from OpenAI API: Missing content", {
        model,
        responseId: response.id,
        choices: response.choices?.length || 0,
        hasChoice: !!choice,
        hasMessage: !!choice?.message,
        hasContent: !!choice?.message?.content
      });
    }
    return choice.message.content;
  }
}
async function getAIClient(options) {
  const { getAI } = await import("./index3.js");
  return await getAI(options);
}
export {
  AIClient,
  OpenAIClient,
  getAIClient,
  getOpenAI
};
//# sourceMappingURL=index2.js.map
