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
var _Asset_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_Asset_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create", "update"] },
  cli: true
})];
class Asset extends (_a = SmrtObject) {
  // Core fields
  name = "";
  // User-friendly name
  slug = "";
  // URL-friendly identifier
  sourceUri = "";
  // URI to the actual file (e.g., 's3://bucket/key', 'file:///path')
  mimeType = "";
  // MIME type (e.g., 'image/jpeg', 'video/mp4')
  description = "";
  // Optional description
  version = 1;
  // Version number
  // Foreign key references (stored as IDs/slugs)
  primaryVersionId = null;
  // Points to first version's ID
  typeSlug = "";
  // FK to AssetType.slug
  statusSlug = "";
  // FK to AssetStatus.slug
  ownerProfileId = null;
  // FK to Profile.id (nullable)
  parentId = null;
  // FK to Asset.id (for derivatives)
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.name) this.name = options.name;
    if (options.slug) this.slug = options.slug;
    if (options.sourceUri) this.sourceUri = options.sourceUri;
    if (options.mimeType) this.mimeType = options.mimeType;
    if (options.description) this.description = options.description;
    if (options.version !== void 0) this.version = options.version;
    if (options.primaryVersionId !== void 0)
      this.primaryVersionId = options.primaryVersionId;
    if (options.typeSlug) this.typeSlug = options.typeSlug;
    if (options.statusSlug) this.statusSlug = options.statusSlug;
    if (options.ownerProfileId !== void 0)
      this.ownerProfileId = options.ownerProfileId;
    if (options.parentId !== void 0) this.parentId = options.parentId;
    if (options.createdAt) this.createdAt = options.createdAt;
    if (options.updatedAt) this.updatedAt = options.updatedAt;
  }
  /**
   * Get all tags for this asset from @have/tags
   *
   * @returns Array of Tag instances from @have/tags package
   */
  async getTags() {
    const collection = this.getCollection();
    if (!collection) return [];
    const db = await collection.getDb();
    const rows = await db.prepare("SELECT tag_slug FROM asset_tags WHERE asset_id = ?").all(this.id);
    const { Tag } = await import("@have/tags");
    const tags = [];
    for (const row of rows) {
      const tag = await Tag.getBySlug(row.tag_slug);
      if (tag) tags.push(tag);
    }
    return tags;
  }
  /**
   * Check if this asset has a specific tag
   *
   * @param tagSlug - The slug of the tag to check
   * @returns True if the asset has this tag
   */
  async hasTag(tagSlug) {
    const collection = this.getCollection();
    if (!collection) return false;
    const db = await collection.getDb();
    const result = await db.prepare(
      "SELECT COUNT(*) as count FROM asset_tags WHERE asset_id = ? AND tag_slug = ?"
    ).get(this.id, tagSlug);
    return result.count > 0;
  }
  /**
   * Get the parent asset (if this is a derivative)
   *
   * @returns Parent Asset instance or null
   */
  async getParent() {
    if (!this.parentId) return null;
    const collection = this.getCollection();
    if (!collection) return null;
    return await collection.get({ id: this.parentId });
  }
  /**
   * Get all derivative assets (children)
   *
   * @returns Array of child Asset instances
   */
  async getChildren() {
    const collection = this.getCollection();
    if (!collection) return [];
    return await collection.list({
      where: { parentId: this.id }
    });
  }
  /**
   * Get the type of this asset
   *
   * @returns AssetType instance or null
   */
  async getType() {
    if (!this.typeSlug) return null;
    const { AssetType } = await import("./index2.js");
    return await AssetType.getBySlug(this.typeSlug);
  }
  /**
   * Get the status of this asset
   *
   * @returns AssetStatus instance or null
   */
  async getStatus() {
    if (!this.statusSlug) return null;
    const { AssetStatus } = await import("./index3.js");
    return await AssetStatus.getBySlug(this.statusSlug);
  }
  /**
   * Get asset by slug
   *
   * @param slug - The slug to search for
   * @returns Asset instance or null
   */
  static async getBySlug(slug) {
    return null;
  }
}
_init = __decoratorStart(_a);
Asset = __decorateElement(_init, 0, "Asset", _Asset_decorators, Asset);
__runInitializers(_init, 1, Asset);
export {
  Asset
};
//# sourceMappingURL=index5.js.map
