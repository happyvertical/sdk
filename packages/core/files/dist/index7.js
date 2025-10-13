import { createWriteStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { dirname } from "node:path";
import { URL } from "node:url";
import { getTempDirectory } from "@have/utils";
const TMP_DIR = path.resolve(getTempDirectory("kissd"));
const isFile = (file) => {
  try {
    const fileStat = statSync(file);
    return fileStat.isDirectory() ? false : fileStat;
  } catch {
    return false;
  }
};
const isDirectory = (dir) => {
  try {
    const dirStat = statSync(dir);
    if (dirStat.isDirectory()) return true;
    throw new Error(`${dir} exists but isn't a directory`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return false;
    }
    throw error;
  }
};
const ensureDirectoryExists = async (dir) => {
  if (!isDirectory(dir)) {
    console.log(`Creating directory: ${dir}`);
    await mkdir(dir, { recursive: true });
  }
};
const upload = async (url, data) => {
  try {
    const response = await fetch(url, {
      method: "PUT",
      body: Buffer.isBuffer(data) ? new Uint8Array(data) : data,
      headers: { "Content-Type": "application/octet-stream" }
    });
    if (!response.ok) {
      throw new Error(`unexpected response ${response.statusText}`);
    }
    return response;
  } catch (error) {
    const err = error;
    console.error(`Error uploading data to ${url}
Error: ${err.message}`);
    throw error;
  }
};
async function download(url, filepath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unexpected response ${response.statusText}`);
    }
    const fileStream = createWriteStream(filepath);
    return new Promise((resolve, reject) => {
      fileStream.on("error", reject);
      fileStream.on("finish", resolve);
      response.body?.pipeTo(
        new WritableStream({
          write(chunk) {
            fileStream.write(Buffer.from(chunk));
          },
          close() {
            fileStream.end();
          },
          abort(reason) {
            fileStream.destroy();
            reject(reason);
          }
        })
      ).catch(reject);
    });
  } catch (error) {
    const err = error;
    console.error("Error downloading file:", err);
    throw error;
  }
}
const downloadFileWithCache = async (url, targetPath = null) => {
  const parsedUrl = new URL(url);
  console.log(targetPath);
  const downloadPath = targetPath || `${TMP_DIR}/downloads/${parsedUrl.hostname}${parsedUrl.pathname}`;
  console.log("downloadPath", downloadPath);
  if (!isFile(downloadPath)) {
    await ensureDirectoryExists(dirname(downloadPath));
    await download(url, downloadPath);
  }
  return downloadPath;
};
const listFiles = async (dirPath, options = { match: /.*/ }) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  return options.match ? files.filter((item) => options.match?.test(item)) : files;
};
async function getCached(file, expiry = 3e5) {
  const cacheFile = path.resolve(TMP_DIR, file);
  const cached = existsSync(cacheFile);
  if (cached) {
    const stats = statSync(cacheFile);
    const modTime = new Date(stats.mtime);
    const now = /* @__PURE__ */ new Date();
    const isExpired = expiry && now.getTime() - modTime.getTime() > expiry;
    if (!isExpired) {
      return await readFile(cacheFile, "utf8");
    }
  }
}
async function setCached(file, data) {
  const cacheFile = path.resolve(TMP_DIR, file);
  await ensureDirectoryExists(path.dirname(cacheFile));
  await writeFile(cacheFile, data);
}
const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime"
  // Add more mappings as needed
};
function getMimeType(fileOrUrl) {
  const urlPattern = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
  let extension;
  if (urlPattern.test(fileOrUrl)) {
    const url = new URL(fileOrUrl);
    extension = path.extname(url.pathname);
  } else {
    extension = path.extname(fileOrUrl);
  }
  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}
export {
  download,
  downloadFileWithCache,
  ensureDirectoryExists,
  getCached,
  getMimeType,
  isDirectory,
  isFile,
  listFiles,
  setCached,
  upload
};
//# sourceMappingURL=index7.js.map
