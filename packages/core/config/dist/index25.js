import { __module as envPaths } from "./index57.js";
import require$$0 from "path";
import require$$1 from "os";
var hasRequiredEnvPaths;
function requireEnvPaths() {
  if (hasRequiredEnvPaths) return envPaths.exports;
  hasRequiredEnvPaths = 1;
  const path = require$$0;
  const os = require$$1;
  const homedir = os.homedir();
  const tmpdir = os.tmpdir();
  const { env } = process;
  const macos = (name) => {
    const library = path.join(homedir, "Library");
    return {
      data: path.join(library, "Application Support", name),
      config: path.join(library, "Preferences", name),
      cache: path.join(library, "Caches", name),
      log: path.join(library, "Logs", name),
      temp: path.join(tmpdir, name)
    };
  };
  const windows = (name) => {
    const appData = env.APPDATA || path.join(homedir, "AppData", "Roaming");
    const localAppData = env.LOCALAPPDATA || path.join(homedir, "AppData", "Local");
    return {
      // Data/config/cache/log are invented by me as Windows isn't opinionated about this
      data: path.join(localAppData, name, "Data"),
      config: path.join(appData, name, "Config"),
      cache: path.join(localAppData, name, "Cache"),
      log: path.join(localAppData, name, "Log"),
      temp: path.join(tmpdir, name)
    };
  };
  const linux = (name) => {
    const username = path.basename(homedir);
    return {
      data: path.join(env.XDG_DATA_HOME || path.join(homedir, ".local", "share"), name),
      config: path.join(env.XDG_CONFIG_HOME || path.join(homedir, ".config"), name),
      cache: path.join(env.XDG_CACHE_HOME || path.join(homedir, ".cache"), name),
      // https://wiki.debian.org/XDGBaseDirectorySpecification#state
      log: path.join(env.XDG_STATE_HOME || path.join(homedir, ".local", "state"), name),
      temp: path.join(tmpdir, username, name)
    };
  };
  const envPaths$1 = (name, options) => {
    if (typeof name !== "string") {
      throw new TypeError(`Expected string, got ${typeof name}`);
    }
    options = Object.assign({ suffix: "nodejs" }, options);
    if (options.suffix) {
      name += `-${options.suffix}`;
    }
    if (process.platform === "darwin") {
      return macos(name);
    }
    if (process.platform === "win32") {
      return windows(name);
    }
    return linux(name);
  };
  envPaths.exports = envPaths$1;
  envPaths.exports.default = envPaths$1;
  return envPaths.exports;
}
export {
  requireEnvPaths as __require
};
//# sourceMappingURL=index25.js.map
