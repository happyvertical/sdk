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
var _AccountTransaction_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_AccountTransaction_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create", "update"] },
  cli: true
})];
class AccountTransaction extends (_a = SmrtObject) {
  // id inherited from SmrtObject
  // Note: slug and name not typically used for transactions
  date = /* @__PURE__ */ new Date();
  description = "";
  metadata = "";
  // JSON metadata (stored as text)
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.date !== void 0) this.date = options.date;
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
   * Get all entries for this transaction
   *
   * @returns Array of AccountTransactionEntry instances
   */
  async getEntries() {
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
    return await collection.list({ where: { transactionId: this.id } });
  }
  /**
   * Calculate the total balance of all entries
   * For balanced transactions, this should be zero
   *
   * @returns Sum of all entry amounts (debits positive, credits negative)
   */
  async getBalance() {
    const entries = await this.getEntries();
    return entries.reduce((sum, entry) => sum + entry.amount, 0);
  }
  /**
   * Check if this transaction is balanced
   * In double-entry accounting, balanced means debits = credits (sum = 0)
   *
   * @returns True if sum of all entries equals zero
   */
  async isBalanced() {
    const balance = await this.getBalance();
    return balance === 0;
  }
  /**
   * Get total debits (positive amounts)
   *
   * @returns Sum of all positive entry amounts
   */
  async getTotalDebits() {
    const entries = await this.getEntries();
    return entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  }
  /**
   * Get total credits (negative amounts, returned as positive)
   *
   * @returns Sum of all negative entry amounts (as positive number)
   */
  async getTotalCredits() {
    const entries = await this.getEntries();
    return Math.abs(
      entries.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)
    );
  }
  /**
   * Get entries grouped by currency
   *
   * @returns Map of currency codes to arrays of entries
   */
  async getEntriesByCurrency() {
    const entries = await this.getEntries();
    const byCurrency = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const currency = entry.currency || "UNKNOWN";
      if (!byCurrency.has(currency)) {
        byCurrency.set(currency, []);
      }
      byCurrency.get(currency)?.push(entry);
    }
    return byCurrency;
  }
}
_init = __decoratorStart(_a);
AccountTransaction = __decorateElement(_init, 0, "AccountTransaction", _AccountTransaction_decorators, AccountTransaction);
__runInitializers(_init, 1, AccountTransaction);
export {
  AccountTransaction
};
//# sourceMappingURL=index3.js.map
