import { __exports as env } from "./index84.js";
import { __require as requireEnvImpl } from "./index85.js";
var hasRequiredEnv;
function requireEnv() {
  if (hasRequiredEnv) return env;
  hasRequiredEnv = 1;
  Object.defineProperty(env, "__esModule", { value: true });
  env.env = void 0;
  const env_impl_js_1 = requireEnvImpl();
  env.env = env_impl_js_1.env;
  return env;
}
export {
  requireEnv as __require
};
//# sourceMappingURL=index51.js.map
