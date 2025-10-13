import { __exports as api } from "./index72.js";
import { __require as requireApiRequest } from "./index73.js";
import { __require as requireApiStream } from "./index74.js";
import { __require as requireApiPipeline } from "./index75.js";
import { __require as requireApiUpgrade } from "./index76.js";
import { __require as requireApiConnect } from "./index77.js";
var hasRequiredApi;
function requireApi() {
  if (hasRequiredApi) return api;
  hasRequiredApi = 1;
  api.request = requireApiRequest();
  api.stream = requireApiStream();
  api.pipeline = requireApiPipeline();
  api.upgrade = requireApiUpgrade();
  api.connect = requireApiConnect();
  return api;
}
export {
  requireApi as __require
};
//# sourceMappingURL=index25.js.map
