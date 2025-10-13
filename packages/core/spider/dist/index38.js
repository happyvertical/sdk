import { __require as requireDecoratorHandler } from "./index35.js";
import { __require as requireErrors } from "./index23.js";
var responseError;
var hasRequiredResponseError;
function requireResponseError() {
  if (hasRequiredResponseError) return responseError;
  hasRequiredResponseError = 1;
  const DecoratorHandler = requireDecoratorHandler();
  const { ResponseError } = requireErrors();
  class ResponseErrorHandler extends DecoratorHandler {
    #statusCode;
    #contentType;
    #decoder;
    #headers;
    #body;
    constructor(_opts, { handler }) {
      super(handler);
    }
    #checkContentType(contentType) {
      return (this.#contentType ?? "").indexOf(contentType) === 0;
    }
    onRequestStart(controller, context) {
      this.#statusCode = 0;
      this.#contentType = null;
      this.#decoder = null;
      this.#headers = null;
      this.#body = "";
      return super.onRequestStart(controller, context);
    }
    onResponseStart(controller, statusCode, headers, statusMessage) {
      this.#statusCode = statusCode;
      this.#headers = headers;
      this.#contentType = headers["content-type"];
      if (this.#statusCode < 400) {
        return super.onResponseStart(controller, statusCode, headers, statusMessage);
      }
      if (this.#checkContentType("application/json") || this.#checkContentType("text/plain")) {
        this.#decoder = new TextDecoder("utf-8");
      }
    }
    onResponseData(controller, chunk) {
      if (this.#statusCode < 400) {
        return super.onResponseData(controller, chunk);
      }
      this.#body += this.#decoder?.decode(chunk, { stream: true }) ?? "";
    }
    onResponseEnd(controller, trailers) {
      if (this.#statusCode >= 400) {
        this.#body += this.#decoder?.decode(void 0, { stream: false }) ?? "";
        if (this.#checkContentType("application/json")) {
          try {
            this.#body = JSON.parse(this.#body);
          } catch {
          }
        }
        let err;
        const stackTraceLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 0;
        try {
          err = new ResponseError("Response Error", this.#statusCode, {
            body: this.#body,
            headers: this.#headers
          });
        } finally {
          Error.stackTraceLimit = stackTraceLimit;
        }
        super.onResponseError(controller, err);
      } else {
        super.onResponseEnd(controller, trailers);
      }
    }
    onResponseError(controller, err) {
      super.onResponseError(controller, err);
    }
  }
  responseError = () => {
    return (dispatch) => {
      return function Intercept(opts, handler) {
        return dispatch(opts, new ResponseErrorHandler(opts, { handler }));
      };
    };
  };
  return responseError;
}
export {
  requireResponseError as __require
};
//# sourceMappingURL=index38.js.map
