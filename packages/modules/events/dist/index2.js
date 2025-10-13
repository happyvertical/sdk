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
var _EventType_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_EventType_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create"] },
  cli: true
})];
class EventType extends (_a = SmrtObject) {
  // id, slug, name inherited from SmrtObject
  description = "";
  // Optional description
  schema = "";
  // JSON schema for event metadata (stored as text)
  participantSchema = "";
  // JSON schema for participant metadata (stored as text)
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.description !== void 0)
      this.description = options.description;
    if (options.schema !== void 0) {
      if (typeof options.schema === "string") {
        this.schema = options.schema;
      } else {
        this.schema = JSON.stringify(options.schema);
      }
    }
    if (options.participantSchema !== void 0) {
      if (typeof options.participantSchema === "string") {
        this.participantSchema = options.participantSchema;
      } else {
        this.participantSchema = JSON.stringify(options.participantSchema);
      }
    }
    if (options.createdAt) this.createdAt = options.createdAt;
    if (options.updatedAt) this.updatedAt = options.updatedAt;
  }
  /**
   * Get schema as parsed object
   *
   * @returns Parsed schema object or empty object if no schema
   */
  getSchema() {
    if (!this.schema) return {};
    try {
      return JSON.parse(this.schema);
    } catch {
      return {};
    }
  }
  /**
   * Set schema from object
   *
   * @param data - Schema object to store
   */
  setSchema(data) {
    this.schema = JSON.stringify(data);
  }
  /**
   * Get participant schema as parsed object
   *
   * @returns Parsed participant schema object or empty object
   */
  getParticipantSchema() {
    if (!this.participantSchema) return {};
    try {
      return JSON.parse(this.participantSchema);
    } catch {
      return {};
    }
  }
  /**
   * Set participant schema from object
   *
   * @param data - Participant schema object to store
   */
  setParticipantSchema(data) {
    this.participantSchema = JSON.stringify(data);
  }
  /**
   * Convenience method for slug-based lookup
   *
   * @param slug - The slug to search for
   * @returns EventType instance or null if not found
   */
  static async getBySlug(slug) {
    return null;
  }
}
_init = __decoratorStart(_a);
EventType = __decorateElement(_init, 0, "EventType", _EventType_decorators, EventType);
__runInitializers(_init, 1, EventType);
export {
  EventType
};
//# sourceMappingURL=index2.js.map
