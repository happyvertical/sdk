import { FilesystemError } from "./index4.js";
const providers = /* @__PURE__ */ new Map();
function registerProvider(type, factory) {
  providers.set(type, factory);
}
function getAvailableProviders() {
  return Array.from(providers.keys());
}
function validateOptions(options) {
  if (!options) {
    throw new FilesystemError("Provider options are required", "EINVAL");
  }
  const type = options.type || "local";
  switch (type) {
    case "local":
      break;
    case "s3": {
      const s3Opts = options;
      if (!s3Opts.region) {
        throw new FilesystemError("S3 provider requires region", "EINVAL");
      }
      if (!s3Opts.bucket) {
        throw new FilesystemError("S3 provider requires bucket", "EINVAL");
      }
      break;
    }
    case "gdrive": {
      const gdriveOpts = options;
      if (!gdriveOpts.clientId) {
        throw new FilesystemError(
          "Google Drive provider requires clientId",
          "EINVAL"
        );
      }
      if (!gdriveOpts.clientSecret) {
        throw new FilesystemError(
          "Google Drive provider requires clientSecret",
          "EINVAL"
        );
      }
      if (!gdriveOpts.refreshToken) {
        throw new FilesystemError(
          "Google Drive provider requires refreshToken",
          "EINVAL"
        );
      }
      break;
    }
    case "webdav": {
      const webdavOpts = options;
      if (!webdavOpts.baseUrl) {
        throw new FilesystemError("WebDAV provider requires baseUrl", "EINVAL");
      }
      if (!webdavOpts.username) {
        throw new FilesystemError(
          "WebDAV provider requires username",
          "EINVAL"
        );
      }
      if (!webdavOpts.password) {
        throw new FilesystemError(
          "WebDAV provider requires password",
          "EINVAL"
        );
      }
      break;
    }
    case "browser-storage":
      break;
    default:
      throw new FilesystemError(`Unknown provider type: ${type}`, "EINVAL");
  }
}
function detectProviderType(options) {
  if (options.type) {
    return options.type;
  }
  if ("region" in options && "bucket" in options) {
    return "s3";
  }
  if ("clientId" in options && "clientSecret" in options) {
    return "gdrive";
  }
  if ("baseUrl" in options && "username" in options) {
    return "webdav";
  }
  if ("databaseName" in options || "storageQuota" in options) {
    return "browser-storage";
  }
  if (typeof globalThis !== "undefined") {
    if (typeof globalThis.window !== "undefined" && typeof globalThis.indexedDB !== "undefined") {
      return "browser-storage";
    }
    if (globalThis.process?.versions?.node) {
      return "local";
    }
  }
  return "local";
}
async function getFilesystem(options = {}) {
  validateOptions(options);
  const type = detectProviderType(options);
  const providerFactory = providers.get(type);
  if (!providerFactory) {
    throw new FilesystemError(
      `Provider '${type}' is not registered. Available providers: ${getAvailableProviders().join(", ")}`,
      "ENOTFOUND"
    );
  }
  try {
    const ProviderClass = await providerFactory();
    return new ProviderClass(options);
  } catch (error) {
    throw new FilesystemError(
      `Failed to create '${type}' provider: ${error instanceof Error ? error.message : String(error)}`,
      "ENOENT",
      void 0,
      type
    );
  }
}
async function initializeProviders() {
  registerProvider("local", async () => {
    const { LocalFilesystemProvider } = await import("./index3.js");
    return LocalFilesystemProvider;
  });
}
function isProviderAvailable(type) {
  return providers.has(type);
}
function getProviderInfo(type) {
  const descriptions = {
    local: "Local filesystem provider using Node.js fs module",
    s3: "S3-compatible provider supporting AWS S3, MinIO, and other S3-compatible services",
    gdrive: "Google Drive provider using Google Drive API v3",
    webdav: "WebDAV provider supporting Nextcloud, ownCloud, Apache mod_dav, and other WebDAV servers",
    "browser-storage": "Browser storage provider using IndexedDB for app file management"
  };
  const requiredOptions = {
    local: [],
    s3: ["region", "bucket"],
    gdrive: ["clientId", "clientSecret", "refreshToken"],
    webdav: ["baseUrl", "username", "password"],
    "browser-storage": []
  };
  return {
    available: isProviderAvailable(type),
    description: descriptions[type] || "Unknown provider",
    requiredOptions: requiredOptions[type] || []
  };
}
export {
  getAvailableProviders,
  getFilesystem,
  getProviderInfo,
  initializeProviders,
  isProviderAvailable,
  registerProvider
};
//# sourceMappingURL=index2.js.map
