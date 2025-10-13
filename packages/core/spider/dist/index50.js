import { __require as requireUtil } from "./index88.js";
import { __require as requireUtil$1 } from "./index24.js";
import { __require as requireWebidl } from "./index91.js";
import require$$0 from "node:util";
var formdata;
var hasRequiredFormdata;
function requireFormdata() {
  if (hasRequiredFormdata) return formdata;
  hasRequiredFormdata = 1;
  const { iteratorMixin } = requireUtil();
  const { kEnumerableProperty } = requireUtil$1();
  const { webidl } = requireWebidl();
  const nodeUtil = require$$0;
  class FormData {
    #state = [];
    constructor(form = void 0) {
      webidl.util.markAsUncloneable(this);
      if (form !== void 0) {
        throw webidl.errors.conversionFailed({
          prefix: "FormData constructor",
          argument: "Argument 1",
          types: ["undefined"]
        });
      }
    }
    append(name, value, filename = void 0) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.append";
      webidl.argumentLengthCheck(arguments, 2, prefix);
      name = webidl.converters.USVString(name);
      if (arguments.length === 3 || webidl.is.Blob(value)) {
        value = webidl.converters.Blob(value, prefix, "value");
        if (filename !== void 0) {
          filename = webidl.converters.USVString(filename);
        }
      } else {
        value = webidl.converters.USVString(value);
      }
      const entry = makeEntry(name, value, filename);
      this.#state.push(entry);
    }
    delete(name) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.delete";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      name = webidl.converters.USVString(name);
      this.#state = this.#state.filter((entry) => entry.name !== name);
    }
    get(name) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.get";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      name = webidl.converters.USVString(name);
      const idx = this.#state.findIndex((entry) => entry.name === name);
      if (idx === -1) {
        return null;
      }
      return this.#state[idx].value;
    }
    getAll(name) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.getAll";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      name = webidl.converters.USVString(name);
      return this.#state.filter((entry) => entry.name === name).map((entry) => entry.value);
    }
    has(name) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.has";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      name = webidl.converters.USVString(name);
      return this.#state.findIndex((entry) => entry.name === name) !== -1;
    }
    set(name, value, filename = void 0) {
      webidl.brandCheck(this, FormData);
      const prefix = "FormData.set";
      webidl.argumentLengthCheck(arguments, 2, prefix);
      name = webidl.converters.USVString(name);
      if (arguments.length === 3 || webidl.is.Blob(value)) {
        value = webidl.converters.Blob(value, prefix, "value");
        if (filename !== void 0) {
          filename = webidl.converters.USVString(filename);
        }
      } else {
        value = webidl.converters.USVString(value);
      }
      const entry = makeEntry(name, value, filename);
      const idx = this.#state.findIndex((entry2) => entry2.name === name);
      if (idx !== -1) {
        this.#state = [
          ...this.#state.slice(0, idx),
          entry,
          ...this.#state.slice(idx + 1).filter((entry2) => entry2.name !== name)
        ];
      } else {
        this.#state.push(entry);
      }
    }
    [nodeUtil.inspect.custom](depth, options) {
      const state = this.#state.reduce((a, b) => {
        if (a[b.name]) {
          if (Array.isArray(a[b.name])) {
            a[b.name].push(b.value);
          } else {
            a[b.name] = [a[b.name], b.value];
          }
        } else {
          a[b.name] = b.value;
        }
        return a;
      }, { __proto__: null });
      options.depth ??= depth;
      options.colors ??= true;
      const output = nodeUtil.formatWithOptions(options, state);
      return `FormData ${output.slice(output.indexOf("]") + 2)}`;
    }
    /**
     * @param {FormData} formData
     */
    static getFormDataState(formData) {
      return formData.#state;
    }
    /**
     * @param {FormData} formData
     * @param {any[]} newState
     */
    static setFormDataState(formData, newState) {
      formData.#state = newState;
    }
  }
  const { getFormDataState, setFormDataState } = FormData;
  Reflect.deleteProperty(FormData, "getFormDataState");
  Reflect.deleteProperty(FormData, "setFormDataState");
  iteratorMixin("FormData", FormData, getFormDataState, "name", "value");
  Object.defineProperties(FormData.prototype, {
    append: kEnumerableProperty,
    delete: kEnumerableProperty,
    get: kEnumerableProperty,
    getAll: kEnumerableProperty,
    has: kEnumerableProperty,
    set: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "FormData",
      configurable: true
    }
  });
  function makeEntry(name, value, filename) {
    if (typeof value === "string") ;
    else {
      if (!webidl.is.File(value)) {
        value = new File([value], "blob", { type: value.type });
      }
      if (filename !== void 0) {
        const options = {
          type: value.type,
          lastModified: value.lastModified
        };
        value = new File([value], filename, options);
      }
    }
    return { name, value };
  }
  webidl.is.FormData = webidl.util.MakeTypeAssertion(FormData);
  formdata = { FormData, makeEntry, setFormDataState };
  return formdata;
}
export {
  requireFormdata as __require
};
//# sourceMappingURL=index50.js.map
