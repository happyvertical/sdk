import { ConsoleLogger } from "./index2.js";
import { LoggerAdapter } from "./index3.js";
class NoopLogger {
  debug(_message, _context) {
  }
  info(_message, _context) {
  }
  warn(_message, _context) {
  }
  error(_message, _context) {
  }
}
function createLogger(config) {
  if (typeof config === "boolean") {
    return config ? new ConsoleLogger("info") : new NoopLogger();
  }
  const level = config.level || "info";
  return new ConsoleLogger(level);
}
export {
  ConsoleLogger,
  LoggerAdapter,
  createLogger
};
//# sourceMappingURL=index.js.map
