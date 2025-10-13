var promise;
var hasRequiredPromise;
function requirePromise() {
  if (hasRequiredPromise) return promise;
  hasRequiredPromise = 1;
  function createDeferredPromise() {
    let res;
    let rej;
    const promise2 = new Promise((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    return { promise: promise2, resolve: res, reject: rej };
  }
  promise = {
    createDeferredPromise
  };
  return promise;
}
export {
  requirePromise as __require
};
//# sourceMappingURL=index93.js.map
