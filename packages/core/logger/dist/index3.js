class LoggerAdapter {
  constructor(logger) {
    this.logger = logger;
  }
  /**
   * Handle a signal and log appropriately
   *
   * @param signal - Signal to log
   */
  async handle(signal) {
    const context = {
      id: signal.id,
      objectId: signal.objectId,
      className: signal.className,
      method: signal.method,
      timestamp: signal.timestamp
    };
    if (signal.duration !== void 0) {
      context.duration = signal.duration;
    }
    if (signal.metadata) {
      context.metadata = signal.metadata;
    }
    switch (signal.type) {
      case "start":
        this.logger.debug(
          `${signal.className}.${signal.method}() started`,
          context
        );
        break;
      case "step":
        this.logger.debug(
          `${signal.className}.${signal.method}() step: ${signal.step || "unknown"}`,
          context
        );
        break;
      case "end":
        this.logger.info(
          `${signal.className}.${signal.method}() completed in ${signal.duration}ms`,
          {
            ...context,
            result: signal.result !== void 0 ? "present" : "none"
          }
        );
        break;
      case "error":
        this.logger.error(
          `${signal.className}.${signal.method}() failed: ${signal.error?.message || "Unknown error"}`,
          {
            ...context,
            error: signal.error ? {
              message: signal.error.message,
              name: signal.error.name,
              stack: signal.error.stack
            } : void 0
          }
        );
        break;
    }
  }
}
export {
  LoggerAdapter
};
//# sourceMappingURL=index3.js.map
