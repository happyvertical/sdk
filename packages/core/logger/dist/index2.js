class ConsoleLogger {
  constructor(level = "info") {
    this.level = level;
  }
  static LEVELS = [
    "debug",
    "info",
    "warn",
    "error"
  ];
  /**
   * Check if a log level should be output
   *
   * @param level - Log level to check
   * @returns True if level meets threshold
   */
  shouldLog(level) {
    const currentIndex = ConsoleLogger.LEVELS.indexOf(this.level);
    const messageIndex = ConsoleLogger.LEVELS.indexOf(level);
    return messageIndex >= currentIndex;
  }
  /**
   * Format context for console output
   *
   * @param context - Structured metadata
   * @returns Formatted context string
   */
  formatContext(context) {
    if (!context || Object.keys(context).length === 0) {
      return "";
    }
    return ` ${JSON.stringify(context)}`;
  }
  debug(message, context) {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}${this.formatContext(context)}`);
    }
  }
  info(message, context) {
    if (this.shouldLog("info")) {
      console.info(`[INFO] ${message}${this.formatContext(context)}`);
    }
  }
  warn(message, context) {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}${this.formatContext(context)}`);
    }
  }
  error(message, context) {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}${this.formatContext(context)}`);
    }
  }
}
export {
  ConsoleLogger
};
//# sourceMappingURL=index2.js.map
