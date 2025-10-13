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
var _AccountTransactionEntry_decorators, _init, _a;
import { SmrtObject, smrt } from "@have/smrt";
_AccountTransactionEntry_decorators = [smrt({
  api: { include: ["list", "get", "create", "update", "delete"] },
  mcp: { include: ["list", "get", "create", "update"] },
  cli: true
})];
let _AccountTransactionEntry = class _AccountTransactionEntry extends (_a = SmrtObject) {
  // id inherited from SmrtObject
  // Note: slug and name not typically used for transaction entries
  transactionId = "";
  // FK to AccountTransaction
  accountId = "";
  // FK to Account
  amount = 0;
  // Integer in smallest currency unit (e.g., cents)
  currency = "USD";
  // ISO 4217 currency code
  description = "";
  // Optional entry-specific description
  // Timestamps
  createdAt = /* @__PURE__ */ new Date();
  updatedAt = /* @__PURE__ */ new Date();
  constructor(options = {}) {
    super(options);
    if (options.transactionId !== void 0)
      this.transactionId = options.transactionId;
    if (options.accountId !== void 0) this.accountId = options.accountId;
    if (options.amount !== void 0) this.amount = options.amount;
    if (options.currency !== void 0) this.currency = options.currency;
    if (options.description !== void 0)
      this.description = options.description;
    if (options.createdAt) this.createdAt = options.createdAt;
    if (options.updatedAt) this.updatedAt = options.updatedAt;
  }
  /**
   * Get the transaction this entry belongs to
   *
   * @returns AccountTransaction instance or null
   */
  async getTransaction() {
    if (!this.transactionId) return null;
    const { AccountTransactionCollection } = await import("./index6.js");
    const { persistence, db, ai, fs, _className } = this.options;
    const collection = new AccountTransactionCollection({
      persistence,
      db,
      ai,
      fs,
      _className
    });
    await collection.initialize();
    return await collection.get({ id: this.transactionId });
  }
  /**
   * Get the account this entry affects
   *
   * @returns Account instance or null
   */
  async getAccount() {
    if (!this.accountId) return null;
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
    return await collection.get({ id: this.accountId });
  }
  /**
   * Check if this entry is a debit
   *
   * @returns True if amount is positive
   */
  isDebit() {
    return this.amount > 0;
  }
  /**
   * Check if this entry is a credit
   *
   * @returns True if amount is negative
   */
  isCredit() {
    return this.amount < 0;
  }
  /**
   * Get the absolute amount value
   *
   * @returns Absolute value of amount
   */
  getAbsoluteAmount() {
    return Math.abs(this.amount);
  }
  /**
   * Format amount as currency string
   * Converts from smallest unit (cents) to standard format
   *
   * @param locale - Optional locale for formatting (default: 'en-US')
   * @returns Formatted currency string
   */
  formatAmount(locale = "en-US") {
    const standardAmount = this.amount / 100;
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: this.currency
      }).format(standardAmount);
    } catch {
      return `${this.currency} ${standardAmount.toFixed(2)}`;
    }
  }
  /**
   * Create a debit entry helper
   * Static factory method for creating debit entries
   *
   * @param options - Entry options with positive amount
   * @returns New AccountTransactionEntry instance
   */
  static createDebit(options) {
    return new _AccountTransactionEntry({
      ...options,
      amount: Math.abs(options.amount)
      // Ensure positive
    });
  }
  /**
   * Create a credit entry helper
   * Static factory method for creating credit entries
   *
   * @param options - Entry options with amount (will be made negative)
   * @returns New AccountTransactionEntry instance
   */
  static createCredit(options) {
    return new _AccountTransactionEntry({
      ...options,
      amount: -Math.abs(options.amount)
      // Ensure negative
    });
  }
};
_init = __decoratorStart(_a);
_AccountTransactionEntry = __decorateElement(_init, 0, "AccountTransactionEntry", _AccountTransactionEntry_decorators, _AccountTransactionEntry);
__runInitializers(_init, 1, _AccountTransactionEntry);
let AccountTransactionEntry = _AccountTransactionEntry;
export {
  AccountTransactionEntry
};
//# sourceMappingURL=index4.js.map
