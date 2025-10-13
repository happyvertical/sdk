class ConsoleLogger {
  debug(message, context) {
    if (context) {
      console.debug(message, context);
    } else {
      console.debug(message);
    }
  }
  info(message, context) {
    if (context) {
      console.info(message, context);
    } else {
      console.info(message);
    }
  }
  warn(message, context) {
    if (context) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }
  error(message, context) {
    if (context) {
      console.error(message, context);
    } else {
      console.error(message);
    }
  }
}
class NoOpLogger {
  debug() {
  }
  info() {
  }
  warn() {
  }
  error() {
  }
}
let globalLogger = new ConsoleLogger();
const setLogger = (logger) => {
  globalLogger = logger;
};
const getLogger = () => {
  return globalLogger;
};
const disableLogging = () => {
  globalLogger = new NoOpLogger();
};
const enableLogging = () => {
  globalLogger = new ConsoleLogger();
};
export {
  disableLogging,
  enableLogging,
  getLogger,
  setLogger
};
//# sourceMappingURL=index5.js.map
