import { __require as requireAgent } from "./index18.js";
import { __require as requireMockAgent } from "./index29.js";
import { __require as requireSnapshotRecorder } from "./index83.js";
import { __require as requireWrapHandler } from "./index67.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireSnapshotUtils } from "./index84.js";
var snapshotAgent;
var hasRequiredSnapshotAgent;
function requireSnapshotAgent() {
  if (hasRequiredSnapshotAgent) return snapshotAgent;
  hasRequiredSnapshotAgent = 1;
  const Agent = requireAgent();
  const MockAgent = requireMockAgent();
  const { SnapshotRecorder } = requireSnapshotRecorder();
  const WrapHandler = requireWrapHandler();
  const { InvalidArgumentError, UndiciError } = requireErrors();
  const { validateSnapshotMode } = requireSnapshotUtils();
  const kSnapshotRecorder = Symbol("kSnapshotRecorder");
  const kSnapshotMode = Symbol("kSnapshotMode");
  const kSnapshotPath = Symbol("kSnapshotPath");
  const kSnapshotLoaded = Symbol("kSnapshotLoaded");
  const kRealAgent = Symbol("kRealAgent");
  let warningEmitted = false;
  class SnapshotAgent extends MockAgent {
    constructor(opts = {}) {
      if (!warningEmitted) {
        process.emitWarning(
          "SnapshotAgent is experimental and subject to change",
          "ExperimentalWarning"
        );
        warningEmitted = true;
      }
      const {
        mode = "record",
        snapshotPath = null,
        ...mockAgentOpts
      } = opts;
      super(mockAgentOpts);
      validateSnapshotMode(mode);
      if ((mode === "playback" || mode === "update") && !snapshotPath) {
        throw new InvalidArgumentError(`snapshotPath is required when mode is '${mode}'`);
      }
      this[kSnapshotMode] = mode;
      this[kSnapshotPath] = snapshotPath;
      this[kSnapshotRecorder] = new SnapshotRecorder({
        snapshotPath: this[kSnapshotPath],
        mode: this[kSnapshotMode],
        maxSnapshots: opts.maxSnapshots,
        autoFlush: opts.autoFlush,
        flushInterval: opts.flushInterval,
        matchHeaders: opts.matchHeaders,
        ignoreHeaders: opts.ignoreHeaders,
        excludeHeaders: opts.excludeHeaders,
        matchBody: opts.matchBody,
        matchQuery: opts.matchQuery,
        caseSensitive: opts.caseSensitive,
        shouldRecord: opts.shouldRecord,
        shouldPlayback: opts.shouldPlayback,
        excludeUrls: opts.excludeUrls
      });
      this[kSnapshotLoaded] = false;
      if (this[kSnapshotMode] === "record" || this[kSnapshotMode] === "update") {
        this[kRealAgent] = new Agent(opts);
      }
      if ((this[kSnapshotMode] === "playback" || this[kSnapshotMode] === "update") && this[kSnapshotPath]) {
        this.loadSnapshots().catch(() => {
        });
      }
    }
    dispatch(opts, handler) {
      handler = WrapHandler.wrap(handler);
      const mode = this[kSnapshotMode];
      if (mode === "playback" || mode === "update") {
        if (!this[kSnapshotLoaded]) {
          return this.#asyncDispatch(opts, handler);
        }
        const snapshot = this[kSnapshotRecorder].findSnapshot(opts);
        if (snapshot) {
          return this.#replaySnapshot(snapshot, handler);
        } else if (mode === "update") {
          return this.#recordAndReplay(opts, handler);
        } else {
          const error = new UndiciError(`No snapshot found for ${opts.method || "GET"} ${opts.path}`);
          if (handler.onError) {
            handler.onError(error);
            return;
          }
          throw error;
        }
      } else if (mode === "record") {
        return this.#recordAndReplay(opts, handler);
      }
    }
    /**
     * Async version of dispatch for when we need to load snapshots first
     */
    async #asyncDispatch(opts, handler) {
      await this.loadSnapshots();
      return this.dispatch(opts, handler);
    }
    /**
     * Records a real request and replays the response
     */
    #recordAndReplay(opts, handler) {
      const responseData = {
        statusCode: null,
        headers: {},
        trailers: {},
        body: []
      };
      const self = this;
      const recordingHandler = {
        onRequestStart(controller, context) {
          return handler.onRequestStart(controller, { ...context, history: this.history });
        },
        onRequestUpgrade(controller, statusCode, headers, socket) {
          return handler.onRequestUpgrade(controller, statusCode, headers, socket);
        },
        onResponseStart(controller, statusCode, headers, statusMessage) {
          responseData.statusCode = statusCode;
          responseData.headers = headers;
          return handler.onResponseStart(controller, statusCode, headers, statusMessage);
        },
        onResponseData(controller, chunk) {
          responseData.body.push(chunk);
          return handler.onResponseData(controller, chunk);
        },
        onResponseEnd(controller, trailers) {
          responseData.trailers = trailers;
          const responseBody = Buffer.concat(responseData.body);
          self[kSnapshotRecorder].record(opts, {
            statusCode: responseData.statusCode,
            headers: responseData.headers,
            body: responseBody,
            trailers: responseData.trailers
          }).then(() => {
            handler.onResponseEnd(controller, trailers);
          }).catch((error) => {
            handler.onResponseError(controller, error);
          });
        }
      };
      const agent = this[kRealAgent];
      return agent.dispatch(opts, recordingHandler);
    }
    /**
     * Replays a recorded response
     *
     * @param {Object} snapshot - The recorded snapshot to replay.
     * @param {Object} handler - The handler to call with the response data.
     * @returns {void}
     */
    #replaySnapshot(snapshot, handler) {
      try {
        const { response } = snapshot;
        const controller = {
          pause() {
          },
          resume() {
          },
          abort(reason) {
            this.aborted = true;
            this.reason = reason;
          },
          aborted: false,
          paused: false
        };
        handler.onRequestStart(controller);
        handler.onResponseStart(controller, response.statusCode, response.headers);
        const body = Buffer.from(response.body, "base64");
        handler.onResponseData(controller, body);
        handler.onResponseEnd(controller, response.trailers);
      } catch (error) {
        handler.onError?.(error);
      }
    }
    /**
     * Loads snapshots from file
     *
     * @param {string} [filePath] - Optional file path to load snapshots from.
     * @returns {Promise<void>} - Resolves when snapshots are loaded.
     */
    async loadSnapshots(filePath) {
      await this[kSnapshotRecorder].loadSnapshots(filePath || this[kSnapshotPath]);
      this[kSnapshotLoaded] = true;
      if (this[kSnapshotMode] === "playback") {
        this.#setupMockInterceptors();
      }
    }
    /**
     * Saves snapshots to file
     *
     * @param {string} [filePath] - Optional file path to save snapshots to.
     * @returns {Promise<void>} - Resolves when snapshots are saved.
     */
    async saveSnapshots(filePath) {
      return this[kSnapshotRecorder].saveSnapshots(filePath || this[kSnapshotPath]);
    }
    /**
     * Sets up MockAgent interceptors based on recorded snapshots.
     *
     * This method creates MockAgent interceptors for each recorded snapshot,
     * allowing the SnapshotAgent to fall back to MockAgent's standard intercept
     * mechanism in playback mode. Each interceptor is configured to persist
     * (remain active for multiple requests) and responds with the recorded
     * response data.
     *
     * Called automatically when loading snapshots in playback mode.
     *
     * @returns {void}
     */
    #setupMockInterceptors() {
      for (const snapshot of this[kSnapshotRecorder].getSnapshots()) {
        const { request, responses, response } = snapshot;
        const url = new URL(request.url);
        const mockPool = this.get(url.origin);
        const responseData = responses ? responses[0] : response;
        if (!responseData) continue;
        mockPool.intercept({
          path: url.pathname + url.search,
          method: request.method,
          headers: request.headers,
          body: request.body
        }).reply(responseData.statusCode, responseData.body, {
          headers: responseData.headers,
          trailers: responseData.trailers
        }).persist();
      }
    }
    /**
     * Gets the snapshot recorder
     * @return {SnapshotRecorder} - The snapshot recorder instance
     */
    getRecorder() {
      return this[kSnapshotRecorder];
    }
    /**
     * Gets the current mode
     * @return {import('./snapshot-utils').SnapshotMode} - The current snapshot mode
     */
    getMode() {
      return this[kSnapshotMode];
    }
    /**
     * Clears all snapshots
     * @returns {void}
     */
    clearSnapshots() {
      this[kSnapshotRecorder].clear();
    }
    /**
     * Resets call counts for all snapshots (useful for test cleanup)
     * @returns {void}
     */
    resetCallCounts() {
      this[kSnapshotRecorder].resetCallCounts();
    }
    /**
     * Deletes a specific snapshot by request options
     * @param {import('./snapshot-recorder').SnapshotRequestOptions} requestOpts - Request options to identify the snapshot
     * @return {Promise<boolean>} - Returns true if the snapshot was deleted, false if not found
     */
    deleteSnapshot(requestOpts) {
      return this[kSnapshotRecorder].deleteSnapshot(requestOpts);
    }
    /**
     * Gets information about a specific snapshot
     * @returns {import('./snapshot-recorder').SnapshotInfo|null} - Snapshot information or null if not found
     */
    getSnapshotInfo(requestOpts) {
      return this[kSnapshotRecorder].getSnapshotInfo(requestOpts);
    }
    /**
     * Replaces all snapshots with new data (full replacement)
     * @param {Array<{hash: string; snapshot: import('./snapshot-recorder').SnapshotEntryshotEntry}>|Record<string, import('./snapshot-recorder').SnapshotEntry>} snapshotData - New snapshot data to replace existing snapshots
     * @returns {void}
     */
    replaceSnapshots(snapshotData) {
      this[kSnapshotRecorder].replaceSnapshots(snapshotData);
    }
    /**
     * Closes the agent, saving snapshots and cleaning up resources.
     *
     * @returns {Promise<void>}
     */
    async close() {
      await this[kSnapshotRecorder].close();
      await this[kRealAgent]?.close();
      await super.close();
    }
  }
  snapshotAgent = SnapshotAgent;
  return snapshotAgent;
}
export {
  requireSnapshotAgent as __require
};
//# sourceMappingURL=index31.js.map
