/**
 * Represents a message in an AI conversation
 */
export class AIMessage {
    /**
     * Original options used to create this message
     */
    options;
    /**
     * Name of the message sender
     */
    name;
    /**
     * Content of the message
     */
    content;
    /**
     * Role of the message sender in the conversation
     */
    role;
    /**
     * Creates a new AI message
     *
     * @param options - Message configuration
     * @param options.role - Role of the message sender
     * @param options.content - Content of the message
     * @param options.name - Name of the message sender
     */
    constructor(options) {
        this.options = options;
        this.role = options.role;
        this.content = options.content;
        this.name = options.name;
    }
    /**
     * Factory method to create a new AI message
     *
     * @param options - Message configuration
     * @param options.thread - Thread this message belongs to
     * @param options.role - Role of the message sender
     * @param options.content - Content of the message
     * @param options.name - Name of the message sender
     * @returns Promise resolving to a new AIMessage instance
     */
    static async create(options) {
        return new AIMessage(options);
    }
}
