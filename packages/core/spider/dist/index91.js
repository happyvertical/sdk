import require$$0 from "node:util";
import require$$1 from "node:worker_threads";
var webidl_1;
var hasRequiredWebidl;
function requireWebidl() {
  if (hasRequiredWebidl) return webidl_1;
  hasRequiredWebidl = 1;
  const { types, inspect } = require$$0;
  const { markAsUncloneable } = require$$1;
  const UNDEFINED = 1;
  const BOOLEAN = 2;
  const STRING = 3;
  const SYMBOL = 4;
  const NUMBER = 5;
  const BIGINT = 6;
  const NULL = 7;
  const OBJECT = 8;
  const FunctionPrototypeSymbolHasInstance = Function.call.bind(Function.prototype[Symbol.hasInstance]);
  const webidl = {
    converters: {},
    util: {},
    errors: {},
    is: {}
  };
  webidl.errors.exception = function(message) {
    return new TypeError(`${message.header}: ${message.message}`);
  };
  webidl.errors.conversionFailed = function(opts) {
    const plural = opts.types.length === 1 ? "" : " one of";
    const message = `${opts.argument} could not be converted to${plural}: ${opts.types.join(", ")}.`;
    return webidl.errors.exception({
      header: opts.prefix,
      message
    });
  };
  webidl.errors.invalidArgument = function(context) {
    return webidl.errors.exception({
      header: context.prefix,
      message: `"${context.value}" is an invalid ${context.type}.`
    });
  };
  webidl.brandCheck = function(V, I) {
    if (!FunctionPrototypeSymbolHasInstance(I, V)) {
      const err = new TypeError("Illegal invocation");
      err.code = "ERR_INVALID_THIS";
      throw err;
    }
  };
  webidl.brandCheckMultiple = function(List) {
    const prototypes = List.map((c) => webidl.util.MakeTypeAssertion(c));
    return (V) => {
      if (prototypes.every((typeCheck) => !typeCheck(V))) {
        const err = new TypeError("Illegal invocation");
        err.code = "ERR_INVALID_THIS";
        throw err;
      }
    };
  };
  webidl.argumentLengthCheck = function({ length }, min, ctx) {
    if (length < min) {
      throw webidl.errors.exception({
        message: `${min} argument${min !== 1 ? "s" : ""} required, but${length ? " only" : ""} ${length} found.`,
        header: ctx
      });
    }
  };
  webidl.illegalConstructor = function() {
    throw webidl.errors.exception({
      header: "TypeError",
      message: "Illegal constructor"
    });
  };
  webidl.util.MakeTypeAssertion = function(I) {
    return (O) => FunctionPrototypeSymbolHasInstance(I, O);
  };
  webidl.util.Type = function(V) {
    switch (typeof V) {
      case "undefined":
        return UNDEFINED;
      case "boolean":
        return BOOLEAN;
      case "string":
        return STRING;
      case "symbol":
        return SYMBOL;
      case "number":
        return NUMBER;
      case "bigint":
        return BIGINT;
      case "function":
      case "object": {
        if (V === null) {
          return NULL;
        }
        return OBJECT;
      }
    }
  };
  webidl.util.Types = {
    UNDEFINED,
    BOOLEAN,
    STRING,
    SYMBOL,
    NUMBER,
    BIGINT,
    NULL,
    OBJECT
  };
  webidl.util.TypeValueToString = function(o) {
    switch (webidl.util.Type(o)) {
      case UNDEFINED:
        return "Undefined";
      case BOOLEAN:
        return "Boolean";
      case STRING:
        return "String";
      case SYMBOL:
        return "Symbol";
      case NUMBER:
        return "Number";
      case BIGINT:
        return "BigInt";
      case NULL:
        return "Null";
      case OBJECT:
        return "Object";
    }
  };
  webidl.util.markAsUncloneable = markAsUncloneable || (() => {
  });
  webidl.util.ConvertToInt = function(V, bitLength, signedness, flags) {
    let upperBound;
    let lowerBound;
    if (bitLength === 64) {
      upperBound = Math.pow(2, 53) - 1;
      if (signedness === "unsigned") {
        lowerBound = 0;
      } else {
        lowerBound = Math.pow(-2, 53) + 1;
      }
    } else if (signedness === "unsigned") {
      lowerBound = 0;
      upperBound = Math.pow(2, bitLength) - 1;
    } else {
      lowerBound = Math.pow(-2, bitLength) - 1;
      upperBound = Math.pow(2, bitLength - 1) - 1;
    }
    let x = Number(V);
    if (x === 0) {
      x = 0;
    }
    if (webidl.util.HasFlag(flags, webidl.attributes.EnforceRange)) {
      if (Number.isNaN(x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
        throw webidl.errors.exception({
          header: "Integer conversion",
          message: `Could not convert ${webidl.util.Stringify(V)} to an integer.`
        });
      }
      x = webidl.util.IntegerPart(x);
      if (x < lowerBound || x > upperBound) {
        throw webidl.errors.exception({
          header: "Integer conversion",
          message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
        });
      }
      return x;
    }
    if (!Number.isNaN(x) && webidl.util.HasFlag(flags, webidl.attributes.Clamp)) {
      x = Math.min(Math.max(x, lowerBound), upperBound);
      if (Math.floor(x) % 2 === 0) {
        x = Math.floor(x);
      } else {
        x = Math.ceil(x);
      }
      return x;
    }
    if (Number.isNaN(x) || x === 0 && Object.is(0, x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
      return 0;
    }
    x = webidl.util.IntegerPart(x);
    x = x % Math.pow(2, bitLength);
    if (signedness === "signed" && x >= Math.pow(2, bitLength) - 1) {
      return x - Math.pow(2, bitLength);
    }
    return x;
  };
  webidl.util.IntegerPart = function(n) {
    const r = Math.floor(Math.abs(n));
    if (n < 0) {
      return -1 * r;
    }
    return r;
  };
  webidl.util.Stringify = function(V) {
    const type = webidl.util.Type(V);
    switch (type) {
      case SYMBOL:
        return `Symbol(${V.description})`;
      case OBJECT:
        return inspect(V);
      case STRING:
        return `"${V}"`;
      case BIGINT:
        return `${V}n`;
      default:
        return `${V}`;
    }
  };
  webidl.util.IsResizableArrayBuffer = function(V) {
    if (types.isArrayBuffer(V)) {
      return V.resizable;
    }
    if (types.isSharedArrayBuffer(V)) {
      return V.growable;
    }
    throw webidl.errors.exception({
      header: "IsResizableArrayBuffer",
      message: `"${webidl.util.Stringify(V)}" is not an array buffer.`
    });
  };
  webidl.util.HasFlag = function(flags, attributes) {
    return typeof flags === "number" && (flags & attributes) === attributes;
  };
  webidl.sequenceConverter = function(converter) {
    return (V, prefix, argument, Iterable) => {
      if (webidl.util.Type(V) !== OBJECT) {
        throw webidl.errors.exception({
          header: prefix,
          message: `${argument} (${webidl.util.Stringify(V)}) is not iterable.`
        });
      }
      const method = typeof Iterable === "function" ? Iterable() : V?.[Symbol.iterator]?.();
      const seq = [];
      let index = 0;
      if (method === void 0 || typeof method.next !== "function") {
        throw webidl.errors.exception({
          header: prefix,
          message: `${argument} is not iterable.`
        });
      }
      while (true) {
        const { done, value } = method.next();
        if (done) {
          break;
        }
        seq.push(converter(value, prefix, `${argument}[${index++}]`));
      }
      return seq;
    };
  };
  webidl.recordConverter = function(keyConverter, valueConverter) {
    return (O, prefix, argument) => {
      if (webidl.util.Type(O) !== OBJECT) {
        throw webidl.errors.exception({
          header: prefix,
          message: `${argument} ("${webidl.util.TypeValueToString(O)}") is not an Object.`
        });
      }
      const result = {};
      if (!types.isProxy(O)) {
        const keys2 = [...Object.getOwnPropertyNames(O), ...Object.getOwnPropertySymbols(O)];
        for (const key of keys2) {
          const keyName = webidl.util.Stringify(key);
          const typedKey = keyConverter(key, prefix, `Key ${keyName} in ${argument}`);
          const typedValue = valueConverter(O[key], prefix, `${argument}[${keyName}]`);
          result[typedKey] = typedValue;
        }
        return result;
      }
      const keys = Reflect.ownKeys(O);
      for (const key of keys) {
        const desc = Reflect.getOwnPropertyDescriptor(O, key);
        if (desc?.enumerable) {
          const typedKey = keyConverter(key, prefix, argument);
          const typedValue = valueConverter(O[key], prefix, argument);
          result[typedKey] = typedValue;
        }
      }
      return result;
    };
  };
  webidl.interfaceConverter = function(TypeCheck, name) {
    return (V, prefix, argument) => {
      if (!TypeCheck(V)) {
        throw webidl.errors.exception({
          header: prefix,
          message: `Expected ${argument} ("${webidl.util.Stringify(V)}") to be an instance of ${name}.`
        });
      }
      return V;
    };
  };
  webidl.dictionaryConverter = function(converters) {
    return (dictionary, prefix, argument) => {
      const dict = {};
      if (dictionary != null && webidl.util.Type(dictionary) !== OBJECT) {
        throw webidl.errors.exception({
          header: prefix,
          message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
        });
      }
      for (const options of converters) {
        const { key, defaultValue, required, converter } = options;
        if (required === true) {
          if (dictionary == null || !Object.hasOwn(dictionary, key)) {
            throw webidl.errors.exception({
              header: prefix,
              message: `Missing required key "${key}".`
            });
          }
        }
        let value = dictionary?.[key];
        const hasDefault = defaultValue !== void 0;
        if (hasDefault && value === void 0) {
          value = defaultValue();
        }
        if (required || hasDefault || value !== void 0) {
          value = converter(value, prefix, `${argument}.${key}`);
          if (options.allowedValues && !options.allowedValues.includes(value)) {
            throw webidl.errors.exception({
              header: prefix,
              message: `${value} is not an accepted type. Expected one of ${options.allowedValues.join(", ")}.`
            });
          }
          dict[key] = value;
        }
      }
      return dict;
    };
  };
  webidl.nullableConverter = function(converter) {
    return (V, prefix, argument) => {
      if (V === null) {
        return V;
      }
      return converter(V, prefix, argument);
    };
  };
  webidl.is.USVString = function(value) {
    return typeof value === "string" && value.isWellFormed();
  };
  webidl.is.ReadableStream = webidl.util.MakeTypeAssertion(ReadableStream);
  webidl.is.Blob = webidl.util.MakeTypeAssertion(Blob);
  webidl.is.URLSearchParams = webidl.util.MakeTypeAssertion(URLSearchParams);
  webidl.is.File = webidl.util.MakeTypeAssertion(File);
  webidl.is.URL = webidl.util.MakeTypeAssertion(URL);
  webidl.is.AbortSignal = webidl.util.MakeTypeAssertion(AbortSignal);
  webidl.is.MessagePort = webidl.util.MakeTypeAssertion(MessagePort);
  webidl.is.BufferSource = function(V) {
    return types.isArrayBuffer(V) || ArrayBuffer.isView(V) && types.isArrayBuffer(V.buffer);
  };
  webidl.converters.DOMString = function(V, prefix, argument, flags) {
    if (V === null && webidl.util.HasFlag(flags, webidl.attributes.LegacyNullToEmptyString)) {
      return "";
    }
    if (typeof V === "symbol") {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} is a symbol, which cannot be converted to a DOMString.`
      });
    }
    return String(V);
  };
  webidl.converters.ByteString = function(V, prefix, argument) {
    if (typeof V === "symbol") {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} is a symbol, which cannot be converted to a ByteString.`
      });
    }
    const x = String(V);
    for (let index = 0; index < x.length; index++) {
      if (x.charCodeAt(index) > 255) {
        throw new TypeError(
          `Cannot convert argument to a ByteString because the character at index ${index} has a value of ${x.charCodeAt(index)} which is greater than 255.`
        );
      }
    }
    return x;
  };
  webidl.converters.USVString = function(value) {
    if (typeof value === "string") {
      return value.toWellFormed();
    }
    return `${value}`.toWellFormed();
  };
  webidl.converters.boolean = function(V) {
    const x = Boolean(V);
    return x;
  };
  webidl.converters.any = function(V) {
    return V;
  };
  webidl.converters["long long"] = function(V, prefix, argument) {
    const x = webidl.util.ConvertToInt(V, 64, "signed", 0, prefix, argument);
    return x;
  };
  webidl.converters["unsigned long long"] = function(V, prefix, argument) {
    const x = webidl.util.ConvertToInt(V, 64, "unsigned", 0, prefix, argument);
    return x;
  };
  webidl.converters["unsigned long"] = function(V, prefix, argument) {
    const x = webidl.util.ConvertToInt(V, 32, "unsigned", 0, prefix, argument);
    return x;
  };
  webidl.converters["unsigned short"] = function(V, prefix, argument, flags) {
    const x = webidl.util.ConvertToInt(V, 16, "unsigned", flags, prefix, argument);
    return x;
  };
  webidl.converters.ArrayBuffer = function(V, prefix, argument, flags) {
    if (webidl.util.Type(V) !== OBJECT || !types.isArrayBuffer(V)) {
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${argument} ("${webidl.util.Stringify(V)}")`,
        types: ["ArrayBuffer"]
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a resizable ArrayBuffer.`
      });
    }
    return V;
  };
  webidl.converters.SharedArrayBuffer = function(V, prefix, argument, flags) {
    if (webidl.util.Type(V) !== OBJECT || !types.isSharedArrayBuffer(V)) {
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${argument} ("${webidl.util.Stringify(V)}")`,
        types: ["SharedArrayBuffer"]
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a resizable SharedArrayBuffer.`
      });
    }
    return V;
  };
  webidl.converters.TypedArray = function(V, T, prefix, argument, flags) {
    if (webidl.util.Type(V) !== OBJECT || !types.isTypedArray(V) || V.constructor.name !== T.name) {
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${argument} ("${webidl.util.Stringify(V)}")`,
        types: [T.name]
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a shared array buffer.`
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a resizable array buffer.`
      });
    }
    return V;
  };
  webidl.converters.DataView = function(V, prefix, argument, flags) {
    if (webidl.util.Type(V) !== OBJECT || !types.isDataView(V)) {
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${argument} ("${webidl.util.Stringify(V)}")`,
        types: ["DataView"]
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a shared array buffer.`
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a resizable array buffer.`
      });
    }
    return V;
  };
  webidl.converters.ArrayBufferView = function(V, prefix, argument, flags) {
    if (webidl.util.Type(V) !== OBJECT || !types.isArrayBufferView(V)) {
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${argument} ("${webidl.util.Stringify(V)}")`,
        types: ["ArrayBufferView"]
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowShared) && types.isSharedArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a shared array buffer.`
      });
    }
    if (!webidl.util.HasFlag(flags, webidl.attributes.AllowResizable) && webidl.util.IsResizableArrayBuffer(V.buffer)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a view on a resizable array buffer.`
      });
    }
    return V;
  };
  webidl.converters.BufferSource = function(V, prefix, argument, flags) {
    if (types.isArrayBuffer(V)) {
      return webidl.converters.ArrayBuffer(V, prefix, argument, flags);
    }
    if (types.isArrayBufferView(V)) {
      flags &= ~webidl.attributes.AllowShared;
      return webidl.converters.ArrayBufferView(V, prefix, argument, flags);
    }
    if (types.isSharedArrayBuffer(V)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} cannot be a SharedArrayBuffer.`
      });
    }
    throw webidl.errors.conversionFailed({
      prefix,
      argument: `${argument} ("${webidl.util.Stringify(V)}")`,
      types: ["ArrayBuffer", "ArrayBufferView"]
    });
  };
  webidl.converters.AllowSharedBufferSource = function(V, prefix, argument, flags) {
    if (types.isArrayBuffer(V)) {
      return webidl.converters.ArrayBuffer(V, prefix, argument, flags);
    }
    if (types.isSharedArrayBuffer(V)) {
      return webidl.converters.SharedArrayBuffer(V, prefix, argument, flags);
    }
    if (types.isArrayBufferView(V)) {
      flags |= webidl.attributes.AllowShared;
      return webidl.converters.ArrayBufferView(V, prefix, argument, flags);
    }
    throw webidl.errors.conversionFailed({
      prefix,
      argument: `${argument} ("${webidl.util.Stringify(V)}")`,
      types: ["ArrayBuffer", "SharedArrayBuffer", "ArrayBufferView"]
    });
  };
  webidl.converters["sequence<ByteString>"] = webidl.sequenceConverter(
    webidl.converters.ByteString
  );
  webidl.converters["sequence<sequence<ByteString>>"] = webidl.sequenceConverter(
    webidl.converters["sequence<ByteString>"]
  );
  webidl.converters["record<ByteString, ByteString>"] = webidl.recordConverter(
    webidl.converters.ByteString,
    webidl.converters.ByteString
  );
  webidl.converters.Blob = webidl.interfaceConverter(webidl.is.Blob, "Blob");
  webidl.converters.AbortSignal = webidl.interfaceConverter(
    webidl.is.AbortSignal,
    "AbortSignal"
  );
  webidl.converters.EventHandlerNonNull = function(V) {
    if (webidl.util.Type(V) !== OBJECT) {
      return null;
    }
    if (typeof V === "function") {
      return V;
    }
    return () => {
    };
  };
  webidl.attributes = {
    Clamp: 1 << 0,
    EnforceRange: 1 << 1,
    AllowShared: 1 << 2,
    AllowResizable: 1 << 3,
    LegacyNullToEmptyString: 1 << 4
  };
  webidl_1 = {
    webidl
  };
  return webidl_1;
}
export {
  requireWebidl as __require
};
//# sourceMappingURL=index91.js.map
