import { __require as requireDispatcher } from "./index15.js";
import { __require as requireRetryHandler } from "./index33.js";
var retryAgent;
var hasRequiredRetryAgent;
function requireRetryAgent() {
  if (hasRequiredRetryAgent) return retryAgent;
  hasRequiredRetryAgent = 1;
  const Dispatcher = requireDispatcher();
  const RetryHandler = requireRetryHandler();
  class RetryAgent extends Dispatcher {
    #agent = null;
    #options = null;
    constructor(agent, options = {}) {
      super(options);
      this.#agent = agent;
      this.#options = options;
    }
    dispatch(opts, handler) {
      const retry = new RetryHandler({
        ...opts,
        retryOptions: this.#options
      }, {
        dispatch: this.#agent.dispatch.bind(this.#agent),
        handler
      });
      return this.#agent.dispatch(opts, retry);
    }
    close() {
      return this.#agent.close();
    }
    destroy() {
      return this.#agent.destroy();
    }
  }
  retryAgent = RetryAgent;
  return retryAgent;
}
export {
  requireRetryAgent as __require
};
//# sourceMappingURL=index21.js.map
