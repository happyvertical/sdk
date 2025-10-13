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
var _Account_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_Account_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create", "update"] },
  cli: true
})];
class Account extends (_a = SmrtObject) {
  // id, slug, name inherited from SmrtObject
  type = "asset";
  currency = "USD";
  // Default to USD, should be set explicitly
  parentId = "";
  // FK to parent Account (nullable for root accounts)
  description = "";
  metadata = "";
  // JSON metadata (stored as text)
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.type !== void 0) this.type = options.type;
    if (options.currency !== void 0) this.currency = options.currency;
    if (options.parentId !== void 0) this.parentId = options.parentId;
    if (options.description !== void 0)
      this.description = options.description;
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
   * Get the parent account
   *
   * @returns Parent Account instance or null
   */
  async getParent() {
    if (!this.parentId) return null;
    const { AccountCollection } = await import("./index5.js");
    const { persistence, db, ai, fs, _className } = this.options;
    const collection = new AccountCollection({
      persistence,
      db,
      ai,
      fs,
      _className
    });
    await collection.initialize();
    return await collection.get({ id: this.parentId });
  }
  /**
   * Get immediate child accounts
   *
   * @returns Array of child Account instances
   */
  async getChildren() {
    const { AccountCollection } = await import("./index5.js");
    const { persistence, db, ai, fs, _className } = this.options;
    const collection = new AccountCollection({
      persistence,
      db,
      ai,
      fs,
      _className
    });
    await collection.initialize();
    return await collection.list({ where: { parentId: this.id } });
  }
  /**
   * Get all ancestor accounts (recursive)
   *
   * @returns Array of ancestor accounts from root to immediate parent
   */
  async getAncestors() {
    const ancestors = [];
    let currentAccount = this;
    while (currentAccount && currentAccount.parentId) {
      const parent = await currentAccount.getParent();
      if (!parent) break;
      ancestors.unshift(parent);
      currentAccount = parent;
    }
    return ancestors;
  }
  /**
   * Get all descendant accounts (recursive)
   *
   * @returns Array of all descendant accounts
   */
  async getDescendants() {
    const children = await this.getChildren();
    const descendants = [...children];
    for (const child of children) {
      const childDescendants = await child.getDescendants();
      descendants.push(...childDescendants);
    }
    return descendants;
  }
  /**
   * Get root account (top-level account with no parent)
   *
   * @returns Root account instance
   */
  async getRootAccount() {
    const ancestors = await this.getAncestors();
    return ancestors.length > 0 ? ancestors[0] : this;
  }
  /**
   * Get full hierarchy for this account
   *
   * @returns Object with ancestors, current, and descendants
   */
  async getHierarchy() {
    const [ancestors, descendants] = await Promise.all([
      this.getAncestors(),
      this.getDescendants()
    ]);
    return {
      ancestors,
      current: this,
      descendants
    };
  }
  /**
   * Check if account is a root account (no parent)
   *
   * @returns True if parentId is empty
   */
  isRoot() {
    return !this.parentId;
  }
  /**
   * Get the depth of this account in the hierarchy
   *
   * @returns Number of ancestors (0 for root accounts)
   */
  async getDepth() {
    const ancestors = await this.getAncestors();
    return ancestors.length;
  }
  /**
   * Get all transaction entries for this account
   *
   * @returns Array of AccountTransactionEntry instances
   */
  async getTransactionEntries() {
    const { AccountTransactionEntryCollection } = await import("./index7.js");
    const { persistence, db, ai, fs, _className } = this.options;
    const collection = new AccountTransactionEntryCollection({
      persistence,
      db,
      ai,
      fs,
      _className
    });
    await collection.initialize();
    return await collection.list({ where: { accountId: this.id } });
  }
  /**
   * Calculate the balance for this account
   * Sum of all transaction entries (debits positive, credits negative)
   *
   * @returns Balance in smallest currency unit (e.g., cents)
   */
  async getBalance() {
    const entries = await this.getTransactionEntries();
    return entries.reduce((sum, entry) => sum + entry.amount, 0);
  }
}
_init = __decoratorStart(_a);
Account = __decorateElement(_init, 0, "Account", _Account_decorators, Account);
__runInitializers(_init, 1, Account);
export {
  Account
};
//# sourceMappingURL=index2.js.map
