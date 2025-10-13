var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _EventSeries_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_EventSeries_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create", "update"] },
  cli: true
})];
class EventSeries extends (_a = SmrtObject) {
  // id, slug, name inherited from SmrtObject
  typeId = "";
  // FK to EventType
  organizerId = "";
  // FK to Profile (from @have/profiles)
  description = "";
  startDate = null;
  endDate = null;
  recurrence = "";
  // JSON recurrence pattern (stored as text)
  metadata = "";
  // JSON metadata (stored as text)
  externalId = "";
  // External system identifier
  source = "";
  // Source system (e.g., 'ticketmaster', 'espn')
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.typeId) this.typeId = options.typeId;
    if (options.organizerId) this.organizerId = options.organizerId;
    if (options.description !== void 0)
      this.description = options.description;
    if (options.startDate !== void 0)
      this.startDate = options.startDate || null;
    if (options.endDate !== void 0) this.endDate = options.endDate || null;
    if (options.externalId !== void 0) this.externalId = options.externalId;
    if (options.source !== void 0) this.source = options.source;
    if (options.recurrence !== void 0) {
      if (typeof options.recurrence === "string") {
        this.recurrence = options.recurrence;
      } else {
        this.recurrence = JSON.stringify(options.recurrence);
      }
    }
    if (options.metadata !== void 0) {
      if (typeof options.metadata === "string") {
        this.metadata = options.metadata;
      } else {
        this.metadata = JSON.stringify(options.metadata);
      }
    }
    if (options.createdAt) this.createdAt = options.createdAt;
    if (options.updatedAt) this.updatedAt = options.updatedAt;
  }
  /**
   * Get recurrence pattern as parsed object
   *
   * @returns Parsed recurrence pattern or null
   */
  getRecurrence() {
    if (!this.recurrence) return null;
    try {
      return JSON.parse(this.recurrence);
    } catch {
      return null;
    }
  }
  /**
   * Set recurrence pattern from object
   *
   * @param pattern - Recurrence pattern to store
   */
  setRecurrence(pattern) {
    this.recurrence = JSON.stringify(pattern);
  }
  /**
   * Get metadata as parsed object
   *
   * @returns Parsed metadata object or empty object
   */
  getMetadata() {
    if (!this.metadata) return {};
    try {
      return JSON.parse(this.metadata);
    } catch {
      return {};
    }
  }
  /**
   * Set metadata from object
   *
   * @param data - Metadata object to store
   */
  setMetadata(data) {
    this.metadata = JSON.stringify(data);
  }
  /**
   * Update metadata by merging with existing values
   *
   * @param updates - Partial metadata to merge
   */
  updateMetadata(updates) {
    const current = this.getMetadata();
    this.setMetadata({ ...current, ...updates });
  }
  /**
   * Get the event type for this series
   *
   * @returns EventType instance or null
   */
  async getType() {
    if (!this.typeId) return null;
    const { EventTypeCollection } = await import("./index6.js");
    const collection = new EventTypeCollection(this.options);
    await collection.initialize();
    return await collection.get({ id: this.typeId });
  }
  /**
   * Get the organizer profile for this series
   *
   * @returns Profile instance or null
   */
  async getOrganizer() {
    if (!this.organizerId) return null;
    try {
      const { ProfileCollection } = await import("@have/profiles");
      const collection = await ProfileCollection.create(this.options);
      return await collection.get({ id: this.organizerId });
    } catch {
      return null;
    }
  }
  /**
   * Get all events in this series
   *
   * @returns Array of Event instances
   */
  async getEvents() {
    const { EventCollection } = await import("./index8.js");
    const collection = new EventCollection(this.options);
    await collection.initialize();
    return await collection.list({ where: { seriesId: this.id } });
  }
  /**
   * Check if series is currently active
   *
   * @returns True if current date is between start and end
   */
  isActive() {
    const now = /* @__PURE__ */ new Date();
    if (this.startDate && now < this.startDate) return false;
    if (this.endDate && now > this.endDate) return false;
    return true;
  }
}
_init = __decoratorStart(_a);
EventSeries = __decorateElement(_init, 0, "EventSeries", _EventSeries_decorators, EventSeries);
__runInitializers(_init, 1, EventSeries);
export {
  EventSeries
};
//# sourceMappingURL=index3.js.map
