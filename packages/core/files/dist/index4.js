class FilesystemError extends Error {
  constructor(message, code, path, provider) {
    super(message);
    this.code = code;
    this.path = path;
    this.provider = provider;
    this.name = "FilesystemError";
  }
}
class FileNotFoundError extends FilesystemError {
  constructor(path, provider) {
    super(`File not found: ${path}`, "ENOENT", path, provider);
    this.name = "FileNotFoundError";
  }
}
class PermissionError extends FilesystemError {
  constructor(path, provider) {
    super(`Permission denied: ${path}`, "EACCES", path, provider);
    this.name = "PermissionError";
  }
}
class DirectoryNotEmptyError extends FilesystemError {
  constructor(path, provider) {
    super(`Directory not empty: ${path}`, "ENOTEMPTY", path, provider);
    this.name = "DirectoryNotEmptyError";
  }
}
class InvalidPathError extends FilesystemError {
  constructor(path, provider) {
    super(`Invalid path: ${path}`, "EINVAL", path, provider);
    this.name = "InvalidPathError";
  }
}
export {
  DirectoryNotEmptyError,
  FileNotFoundError,
  FilesystemError,
  InvalidPathError,
  PermissionError
};
//# sourceMappingURL=index4.js.map
