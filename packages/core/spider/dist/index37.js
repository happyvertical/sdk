import { __require as requireRedirectHandler } from "./index36.js";
var redirect;
var hasRequiredRedirect;
function requireRedirect() {
  if (hasRequiredRedirect) return redirect;
  hasRequiredRedirect = 1;
  const RedirectHandler = requireRedirectHandler();
  function createRedirectInterceptor({ maxRedirections: defaultMaxRedirections } = {}) {
    return (dispatch) => {
      return function Intercept(opts, handler) {
        const { maxRedirections = defaultMaxRedirections, ...rest } = opts;
        if (maxRedirections == null || maxRedirections === 0) {
          return dispatch(opts, handler);
        }
        const dispatchOpts = { ...rest };
        const redirectHandler = new RedirectHandler(dispatch, maxRedirections, dispatchOpts, handler);
        return dispatch(dispatchOpts, redirectHandler);
      };
    };
  }
  redirect = createRedirectInterceptor;
  return redirect;
}
export {
  requireRedirect as __require
};
//# sourceMappingURL=index37.js.map
