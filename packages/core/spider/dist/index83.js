import require$$0 from "node:fs/promises";
import require$$1 from "node:path";
import require$$2 from "node:timers";
import { __require as requireErrors } from "./index23.js";
import { __require as requireSnapshotUtils } from "./index84.js";
var snapshotRecorder;
var hasRequiredSnapshotRecorder;
function requireSnapshotRecorder() {
  if (hasRequiredSnapshotRecorder) return snapshotRecorder;
  hasRequiredSnapshotRecorder = 1;
  const { writeFile, readFile, mkdir } = require$$0;
  const { dirname, resolve } = require$$1;
  const { setTimeout, clearTimeout } = require$$2;
  const { InvalidArgumentError, UndiciError } = requireErrors();
  const { hashId, isUrlExcludedFactory, normalizeHeaders, createHeaderFilters } = requireSnapshotUtils();
  function formatRequestKey(opts, headerFilters, matchOptions = {}) {
    const url = new URL(opts.path, opts.origin);
    const normalized = opts._normalizedHeaders || normalizeHeaders(opts.headers);
    if (!opts._normalizedHeaders) {
      opts._normalizedHeaders = normalized;
    }
    return {
      method: opts.method || "GET",
      url: matchOptions.matchQuery !== false ? url.toString() : `${url.origin}${url.pathname}`,
      headers: filterHeadersForMatching(normalized, headerFilters, matchOptions),
      body: matchOptions.matchBody !== false && opts.body ? String(opts.body) : ""
    };
  }
  function filterHeadersForMatching(headers, headerFilters, matchOptions = {}) {
    if (!headers || typeof headers !== "object") return {};
    const {
      caseSensitive = false
    } = matchOptions;
    const filtered = {};
    const { ignore, exclude, match } = headerFilters;
    for (const [key, value] of Object.entries(headers)) {
      const headerKey = caseSensitive ? key : key.toLowerCase();
      if (exclude.has(headerKey)) continue;
      if (ignore.has(headerKey)) continue;
      if (match.size !== 0) {
        if (!match.has(headerKey)) continue;
      }
      filtered[headerKey] = value;
    }
    return filtered;
  }
  function filterHeadersForStorage(headers, headerFilters, matchOptions = {}) {
    if (!headers || typeof headers !== "object") return {};
    const {
      caseSensitive = false
    } = matchOptions;
    const filtered = {};
    const { exclude: excludeSet } = headerFilters;
    for (const [key, value] of Object.entries(headers)) {
      const headerKey = caseSensitive ? key : key.toLowerCase();
      if (excludeSet.has(headerKey)) continue;
      filtered[headerKey] = value;
    }
    return filtered;
  }
  function createRequestHash(formattedRequest) {
    const parts = [
      formattedRequest.method,
      formattedRequest.url
    ];
    if (formattedRequest.headers && typeof formattedRequest.headers === "object") {
      const headerKeys = Object.keys(formattedRequest.headers).sort();
      for (const key of headerKeys) {
        const values = Array.isArray(formattedRequest.headers[key]) ? formattedRequest.headers[key] : [formattedRequest.headers[key]];
        parts.push(key);
        for (const value of values.sort()) {
          parts.push(String(value));
        }
      }
    }
    parts.push(formattedRequest.body);
    const content = parts.join("|");
    return hashId(content);
  }
  class SnapshotRecorder {
    /** @type {NodeJS.Timeout | null} */
    #flushTimeout;
    /** @type {import('./snapshot-utils').IsUrlExcluded} */
    #isUrlExcluded;
    /** @type {Map<string, SnapshotEntry>} */
    #snapshots = /* @__PURE__ */ new Map();
    /** @type {string|undefined} */
    #snapshotPath;
    /** @type {number} */
    #maxSnapshots = Infinity;
    /** @type {boolean} */
    #autoFlush = false;
    /** @type {import('./snapshot-utils').HeaderFilters} */
    #headerFilters;
    /**
     * Creates a new SnapshotRecorder instance
     * @param {SnapshotRecorderOptions&SnapshotRecorderMatchOptions} [options={}] - Configuration options for the recorder
     */
    constructor(options = {}) {
      this.#snapshotPath = options.snapshotPath;
      this.#maxSnapshots = options.maxSnapshots || Infinity;
      this.#autoFlush = options.autoFlush || false;
      this.flushInterval = options.flushInterval || 3e4;
      this._flushTimer = null;
      this.matchOptions = {
        matchHeaders: options.matchHeaders || [],
        // empty means match all headers
        ignoreHeaders: options.ignoreHeaders || [],
        excludeHeaders: options.excludeHeaders || [],
        matchBody: options.matchBody !== false,
        // default: true
        matchQuery: options.matchQuery !== false,
        // default: true
        caseSensitive: options.caseSensitive || false
      };
      this.#headerFilters = createHeaderFilters(this.matchOptions);
      this.shouldRecord = options.shouldRecord || (() => true);
      this.shouldPlayback = options.shouldPlayback || (() => true);
      this.#isUrlExcluded = isUrlExcludedFactory(options.excludeUrls);
      if (this.#autoFlush && this.#snapshotPath) {
        this.#startAutoFlush();
      }
    }
    /**
     * Records a request-response interaction
     * @param {SnapshotRequestOptions} requestOpts - Request options
     * @param {SnapshotEntryResponse} response - Response data to record
     * @return {Promise<void>} - Resolves when the recording is complete
     */
    async record(requestOpts, response) {
      if (!this.shouldRecord(requestOpts)) {
        return;
      }
      const url = new URL(requestOpts.path, requestOpts.origin).toString();
      if (this.#isUrlExcluded(url)) {
        return;
      }
      const request = formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions);
      const hash = createRequestHash(request);
      const normalizedHeaders = normalizeHeaders(response.headers);
      const responseData = {
        statusCode: response.statusCode,
        headers: filterHeadersForStorage(normalizedHeaders, this.#headerFilters, this.matchOptions),
        body: Buffer.isBuffer(response.body) ? response.body.toString("base64") : Buffer.from(String(response.body || "")).toString("base64"),
        trailers: response.trailers
      };
      if (this.#snapshots.size >= this.#maxSnapshots && !this.#snapshots.has(hash)) {
        const oldestKey = this.#snapshots.keys().next().value;
        this.#snapshots.delete(oldestKey);
      }
      const existingSnapshot = this.#snapshots.get(hash);
      if (existingSnapshot && existingSnapshot.responses) {
        existingSnapshot.responses.push(responseData);
        existingSnapshot.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      } else {
        this.#snapshots.set(hash, {
          request,
          responses: [responseData],
          // Always store as array for consistency
          callCount: 0,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      if (this.#autoFlush && this.#snapshotPath) {
        this.#scheduleFlush();
      }
    }
    /**
     * Finds a matching snapshot for the given request
     * Returns the appropriate response based on call count for sequential responses
     *
     * @param {SnapshotRequestOptions} requestOpts - Request options to match
     * @returns {SnapshotEntry&Record<'response', SnapshotEntryResponse>|undefined} - Matching snapshot response or undefined if not found
     */
    findSnapshot(requestOpts) {
      if (!this.shouldPlayback(requestOpts)) {
        return void 0;
      }
      const url = new URL(requestOpts.path, requestOpts.origin).toString();
      if (this.#isUrlExcluded(url)) {
        return void 0;
      }
      const request = formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions);
      const hash = createRequestHash(request);
      const snapshot = this.#snapshots.get(hash);
      if (!snapshot) return void 0;
      const currentCallCount = snapshot.callCount || 0;
      const responseIndex = Math.min(currentCallCount, snapshot.responses.length - 1);
      snapshot.callCount = currentCallCount + 1;
      return {
        ...snapshot,
        response: snapshot.responses[responseIndex]
      };
    }
    /**
     * Loads snapshots from file
     * @param {string} [filePath] - Optional file path to load snapshots from
     * @return {Promise<void>} - Resolves when snapshots are loaded
     */
    async loadSnapshots(filePath) {
      const path = filePath || this.#snapshotPath;
      if (!path) {
        throw new InvalidArgumentError("Snapshot path is required");
      }
      try {
        const data = await readFile(resolve(path), "utf8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.#snapshots.clear();
          for (const { hash, snapshot } of parsed) {
            this.#snapshots.set(hash, snapshot);
          }
        } else {
          this.#snapshots = new Map(Object.entries(parsed));
        }
      } catch (error) {
        if (error.code === "ENOENT") {
          this.#snapshots.clear();
        } else {
          throw new UndiciError(`Failed to load snapshots from ${path}`, { cause: error });
        }
      }
    }
    /**
     * Saves snapshots to file
     *
     * @param {string} [filePath] - Optional file path to save snapshots
     * @returns {Promise<void>} - Resolves when snapshots are saved
     */
    async saveSnapshots(filePath) {
      const path = filePath || this.#snapshotPath;
      if (!path) {
        throw new InvalidArgumentError("Snapshot path is required");
      }
      const resolvedPath = resolve(path);
      await mkdir(dirname(resolvedPath), { recursive: true });
      const data = Array.from(this.#snapshots.entries()).map(([hash, snapshot]) => ({
        hash,
        snapshot
      }));
      await writeFile(resolvedPath, JSON.stringify(data, null, 2), { flush: true });
    }
    /**
     * Clears all recorded snapshots
     * @returns {void}
     */
    clear() {
      this.#snapshots.clear();
    }
    /**
     * Gets all recorded snapshots
     * @return {Array<SnapshotEntry>} - Array of all recorded snapshots
     */
    getSnapshots() {
      return Array.from(this.#snapshots.values());
    }
    /**
     * Gets snapshot count
     * @return {number} - Number of recorded snapshots
     */
    size() {
      return this.#snapshots.size;
    }
    /**
     * Resets call counts for all snapshots (useful for test cleanup)
     * @returns {void}
     */
    resetCallCounts() {
      for (const snapshot of this.#snapshots.values()) {
        snapshot.callCount = 0;
      }
    }
    /**
     * Deletes a specific snapshot by request options
     * @param {SnapshotRequestOptions} requestOpts - Request options to match
     * @returns {boolean} - True if snapshot was deleted, false if not found
     */
    deleteSnapshot(requestOpts) {
      const request = formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions);
      const hash = createRequestHash(request);
      return this.#snapshots.delete(hash);
    }
    /**
     * Gets information about a specific snapshot
     * @param {SnapshotRequestOptions} requestOpts - Request options to match
     * @returns {SnapshotInfo|null} - Snapshot information or null if not found
     */
    getSnapshotInfo(requestOpts) {
      const request = formatRequestKey(requestOpts, this.#headerFilters, this.matchOptions);
      const hash = createRequestHash(request);
      const snapshot = this.#snapshots.get(hash);
      if (!snapshot) return null;
      return {
        hash,
        request: snapshot.request,
        responseCount: snapshot.responses ? snapshot.responses.length : snapshot.response ? 1 : 0,
        // .response for legacy snapshots
        callCount: snapshot.callCount || 0,
        timestamp: snapshot.timestamp
      };
    }
    /**
     * Replaces all snapshots with new data (full replacement)
     * @param {Array<{hash: string; snapshot: SnapshotEntry}>|Record<string, SnapshotEntry>} snapshotData - New snapshot data to replace existing ones
     * @returns {void}
     */
    replaceSnapshots(snapshotData) {
      this.#snapshots.clear();
      if (Array.isArray(snapshotData)) {
        for (const { hash, snapshot } of snapshotData) {
          this.#snapshots.set(hash, snapshot);
        }
      } else if (snapshotData && typeof snapshotData === "object") {
        this.#snapshots = new Map(Object.entries(snapshotData));
      }
    }
    /**
     * Starts the auto-flush timer
     * @returns {void}
     */
    #startAutoFlush() {
      return this.#scheduleFlush();
    }
    /**
     * Stops the auto-flush timer
     * @returns {void}
     */
    #stopAutoFlush() {
      if (this.#flushTimeout) {
        clearTimeout(this.#flushTimeout);
        this.saveSnapshots().catch(() => {
        });
        this.#flushTimeout = null;
      }
    }
    /**
     * Schedules a flush (debounced to avoid excessive writes)
     */
    #scheduleFlush() {
      this.#flushTimeout = setTimeout(() => {
        this.saveSnapshots().catch(() => {
        });
        if (this.#autoFlush) {
          this.#flushTimeout?.refresh();
        } else {
          this.#flushTimeout = null;
        }
      }, 1e3);
    }
    /**
     * Cleanup method to stop timers
     * @returns {void}
     */
    destroy() {
      this.#stopAutoFlush();
      if (this.#flushTimeout) {
        clearTimeout(this.#flushTimeout);
        this.#flushTimeout = null;
      }
    }
    /**
     * Async close method that saves all recordings and performs cleanup
     * @returns {Promise<void>}
     */
    async close() {
      if (this.#snapshotPath && this.#snapshots.size !== 0) {
        await this.saveSnapshots();
      }
      this.destroy();
    }
  }
  snapshotRecorder = { SnapshotRecorder, formatRequestKey, createRequestHash, filterHeadersForMatching, filterHeadersForStorage, createHeaderFilters };
  return snapshotRecorder;
}
export {
  requireSnapshotRecorder as __require
};
//# sourceMappingURL=index83.js.map
