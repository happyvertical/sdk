import { AIClient } from "./index2.js";
import { AIMessage } from "./index4.js";
class AIThread {
  /**
   * AI client instance for this thread
   */
  ai;
  /**
   * Options used to configure this thread
   */
  options;
  /**
   * Messages in this conversation thread
   */
  messages = [];
  /**
   * Reference materials to include in the conversation context
   */
  references = {};
  /**
   * Creates a new AI thread
   *
   * @param options - Thread configuration options
   */
  constructor(options) {
    this.options = options;
  }
  /**
   * Factory method to create and initialize a new AI thread
   *
   * @param options - Thread configuration options
   * @returns Promise resolving to an initialized AIThread
   */
  static async create(options) {
    const thread = new AIThread(options);
    await thread.initialize();
    return thread;
  }
  /**
   * Initializes the AI client for this thread
   */
  async initialize() {
    this.ai = await AIClient.create(this.options.ai);
  }
  /**
   * Adds a system message to the conversation
   *
   * @param prompt - System message content
   * @returns Promise resolving to the created AIMessage
   */
  async addSystem(prompt) {
    const message = await AIMessage.create({
      thread: this,
      role: "system",
      name: "system",
      content: prompt
    });
    this.messages.push(message);
    return message;
  }
  /**
   * Adds a message to the conversation
   *
   * @param options - Message options
   * @param options.role - Role of the message sender
   * @param options.name - Optional name of the message sender
   * @param options.content - Content of the message
   * @returns Promise resolving to the created AIMessage
   */
  async add(options) {
    const message = await AIMessage.create({
      thread: this,
      role: options.role,
      name: options.name || options.role,
      // Default name to role if not provided
      content: options.content
    });
    this.messages.push(message);
    return message;
  }
  /**
   * Gets all messages in this thread
   *
   * @returns Array of AIMessage objects
   */
  get() {
    return this.messages;
  }
  /**
   * Adds a reference to be included in the conversation context
   *
   * @param name - Name of the reference
   * @param body - Content of the reference
   */
  addReference(name, body) {
    this.references[name] = body;
  }
  /**
   * Assembles the conversation history for sending to the AI
   * Properly orders system message, references, and conversation messages
   *
   * @returns Array of message parameters formatted for the OpenAI API
   */
  assembleHistory() {
    const history = [];
    const systemMessage = this.messages.find((m) => m.role === "system");
    if (systemMessage) {
      history.push({
        role: systemMessage.role,
        content: systemMessage.content
      });
    }
    for (const name in this.references) {
      history.push({
        role: "user",
        content: `Reference - ${name}:
${this.references[name]}`
      });
    }
    this.messages.filter((m) => m.role !== "system").forEach((message) => {
      history.push({ role: message.role, content: message.content });
    });
    return history;
  }
  /**
   * Sends a prompt to the AI and gets a response
   *
   * @param prompt - Prompt message to send
   * @param options - Options for the AI response
   * @param options.responseFormat - Format for the AI to respond with
   * @returns Promise resolving to the AI response
   */
  async do(prompt, options = {
    responseFormat: "text"
  }) {
    const { responseFormat } = options;
    const history = this.assembleHistory();
    const response = await this.ai.textCompletion(prompt, {
      history,
      responseFormat: {
        type: responseFormat === "json" ? "json_object" : "text"
      }
    });
    return response;
  }
}
export {
  AIThread
};
//# sourceMappingURL=index5.js.map
