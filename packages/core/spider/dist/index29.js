import { __require as requireSymbols } from "./index53.js";
import { __require as requireAgent } from "./index18.js";
import { __require as requireMockSymbols } from "./index79.js";
import { __require as requireMockClient } from "./index27.js";
import { __require as requireMockPool } from "./index30.js";
import { __require as requireMockUtils } from "./index78.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireDispatcher } from "./index15.js";
import { __require as requirePendingInterceptorsFormatter } from "./index82.js";
import { __require as requireMockCallHistory } from "./index28.js";
var mockAgent;
var hasRequiredMockAgent;
function requireMockAgent() {
  if (hasRequiredMockAgent) return mockAgent;
  hasRequiredMockAgent = 1;
  const { kClients } = requireSymbols();
  const Agent = requireAgent();
  const {
    kAgent,
    kMockAgentSet,
    kMockAgentGet,
    kDispatches,
    kIsMockActive,
    kNetConnect,
    kGetNetConnect,
    kOptions,
    kFactory,
    kMockAgentRegisterCallHistory,
    kMockAgentIsCallHistoryEnabled,
    kMockAgentAddCallHistoryLog,
    kMockAgentMockCallHistoryInstance,
    kMockAgentAcceptsNonStandardSearchParameters,
    kMockCallHistoryAddLog,
    kIgnoreTrailingSlash
  } = requireMockSymbols();
  const MockClient = requireMockClient();
  const MockPool = requireMockPool();
  const { matchValue, normalizeSearchParams, buildAndValidateMockOptions } = requireMockUtils();
  const { InvalidArgumentError, UndiciError } = requireErrors();
  const Dispatcher = requireDispatcher();
  const PendingInterceptorsFormatter = requirePendingInterceptorsFormatter();
  const { MockCallHistory } = requireMockCallHistory();
  class MockAgent extends Dispatcher {
    constructor(opts = {}) {
      super(opts);
      const mockOptions = buildAndValidateMockOptions(opts);
      this[kNetConnect] = true;
      this[kIsMockActive] = true;
      this[kMockAgentIsCallHistoryEnabled] = mockOptions.enableCallHistory ?? false;
      this[kMockAgentAcceptsNonStandardSearchParameters] = mockOptions.acceptNonStandardSearchParameters ?? false;
      this[kIgnoreTrailingSlash] = mockOptions.ignoreTrailingSlash ?? false;
      if (opts?.agent && typeof opts.agent.dispatch !== "function") {
        throw new InvalidArgumentError("Argument opts.agent must implement Agent");
      }
      const agent = opts?.agent ? opts.agent : new Agent(opts);
      this[kAgent] = agent;
      this[kClients] = agent[kClients];
      this[kOptions] = mockOptions;
      if (this[kMockAgentIsCallHistoryEnabled]) {
        this[kMockAgentRegisterCallHistory]();
      }
    }
    get(origin) {
      const originKey = this[kIgnoreTrailingSlash] ? origin.replace(/\/$/, "") : origin;
      let dispatcher = this[kMockAgentGet](originKey);
      if (!dispatcher) {
        dispatcher = this[kFactory](originKey);
        this[kMockAgentSet](originKey, dispatcher);
      }
      return dispatcher;
    }
    dispatch(opts, handler) {
      this.get(opts.origin);
      this[kMockAgentAddCallHistoryLog](opts);
      const acceptNonStandardSearchParameters = this[kMockAgentAcceptsNonStandardSearchParameters];
      const dispatchOpts = { ...opts };
      if (acceptNonStandardSearchParameters && dispatchOpts.path) {
        const [path, searchParams] = dispatchOpts.path.split("?");
        const normalizedSearchParams = normalizeSearchParams(searchParams, acceptNonStandardSearchParameters);
        dispatchOpts.path = `${path}?${normalizedSearchParams}`;
      }
      return this[kAgent].dispatch(dispatchOpts, handler);
    }
    async close() {
      this.clearCallHistory();
      await this[kAgent].close();
      this[kClients].clear();
    }
    deactivate() {
      this[kIsMockActive] = false;
    }
    activate() {
      this[kIsMockActive] = true;
    }
    enableNetConnect(matcher) {
      if (typeof matcher === "string" || typeof matcher === "function" || matcher instanceof RegExp) {
        if (Array.isArray(this[kNetConnect])) {
          this[kNetConnect].push(matcher);
        } else {
          this[kNetConnect] = [matcher];
        }
      } else if (typeof matcher === "undefined") {
        this[kNetConnect] = true;
      } else {
        throw new InvalidArgumentError("Unsupported matcher. Must be one of String|Function|RegExp.");
      }
    }
    disableNetConnect() {
      this[kNetConnect] = false;
    }
    enableCallHistory() {
      this[kMockAgentIsCallHistoryEnabled] = true;
      return this;
    }
    disableCallHistory() {
      this[kMockAgentIsCallHistoryEnabled] = false;
      return this;
    }
    getCallHistory() {
      return this[kMockAgentMockCallHistoryInstance];
    }
    clearCallHistory() {
      if (this[kMockAgentMockCallHistoryInstance] !== void 0) {
        this[kMockAgentMockCallHistoryInstance].clear();
      }
    }
    // This is required to bypass issues caused by using global symbols - see:
    // https://github.com/nodejs/undici/issues/1447
    get isMockActive() {
      return this[kIsMockActive];
    }
    [kMockAgentRegisterCallHistory]() {
      if (this[kMockAgentMockCallHistoryInstance] === void 0) {
        this[kMockAgentMockCallHistoryInstance] = new MockCallHistory();
      }
    }
    [kMockAgentAddCallHistoryLog](opts) {
      if (this[kMockAgentIsCallHistoryEnabled]) {
        this[kMockAgentRegisterCallHistory]();
        this[kMockAgentMockCallHistoryInstance][kMockCallHistoryAddLog](opts);
      }
    }
    [kMockAgentSet](origin, dispatcher) {
      this[kClients].set(origin, { count: 0, dispatcher });
    }
    [kFactory](origin) {
      const mockOptions = Object.assign({ agent: this }, this[kOptions]);
      return this[kOptions] && this[kOptions].connections === 1 ? new MockClient(origin, mockOptions) : new MockPool(origin, mockOptions);
    }
    [kMockAgentGet](origin) {
      const result = this[kClients].get(origin);
      if (result?.dispatcher) {
        return result.dispatcher;
      }
      if (typeof origin !== "string") {
        const dispatcher = this[kFactory]("http://localhost:9999");
        this[kMockAgentSet](origin, dispatcher);
        return dispatcher;
      }
      for (const [keyMatcher, result2] of Array.from(this[kClients])) {
        if (result2 && typeof keyMatcher !== "string" && matchValue(keyMatcher, origin)) {
          const dispatcher = this[kFactory](origin);
          this[kMockAgentSet](origin, dispatcher);
          dispatcher[kDispatches] = result2.dispatcher[kDispatches];
          return dispatcher;
        }
      }
    }
    [kGetNetConnect]() {
      return this[kNetConnect];
    }
    pendingInterceptors() {
      const mockAgentClients = this[kClients];
      return Array.from(mockAgentClients.entries()).flatMap(([origin, result]) => result.dispatcher[kDispatches].map((dispatch) => ({ ...dispatch, origin }))).filter(({ pending }) => pending);
    }
    assertNoPendingInterceptors({ pendingInterceptorsFormatter = new PendingInterceptorsFormatter() } = {}) {
      const pending = this.pendingInterceptors();
      if (pending.length === 0) {
        return;
      }
      throw new UndiciError(
        pending.length === 1 ? `1 interceptor is pending:

${pendingInterceptorsFormatter.format(pending)}`.trim() : `${pending.length} interceptors are pending:

${pendingInterceptorsFormatter.format(pending)}`.trim()
      );
    }
  }
  mockAgent = MockAgent;
  return mockAgent;
}
export {
  requireMockAgent as __require
};
//# sourceMappingURL=index29.js.map
