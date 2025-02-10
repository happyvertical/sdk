import { statSync, createWriteStream, Dirent, existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readdir,
  writeFile,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { dirname } from 'node:path';
import { URL } from 'node:url';

const TMP_DIR = path.resolve(`${tmpdir()}/kissd`);

export const isFile = (file: string): false | ReturnType<typeof statSync> => {
  try {
    const fileStat = statSync(file);
    return fileStat.isDirectory() ? false : fileStat;
  } catch {
    return false;
  }
};

export const isDirectory = (dir: string): boolean => {
  try {
    const dirStat = statSync(dir);
    if (dirStat.isDirectory()) return true;
    throw new Error(`${dir} exists but isn't a directory`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      return false;
    }
    throw error;
  }
};

export const ensureDirectoryExists = async (dir: string): Promise<void> => {
  if (!isDirectory(dir)) {
    await mkdir(dir, { recursive: true });
  }
};

export const upload = async (
  url: string,
  data: string | Buffer,
): Promise<Response> => {
  try {
    const response = await fetch(url, {
      method: 'PUT',
      body: data,
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    if (!response.ok) {
      throw new Error(`unexpected response ${response.statusText}`);
    }
    return response;
  } catch (error) {
    const err = error as Error;
    console.error(`Error uploading data to ${url}\nError: ${err.message}`);
    throw error; // Re-throw to allow proper error handling
  }
};

export async function download(url: string, filepath: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unexpected response ${response.statusText}`);
    }

    const fileStream = createWriteStream(filepath);
    console.log({ filepath });
    await response.body?.pipeTo(
      new WritableStream({
        write(chunk) {
          fileStream.write(Buffer.from(chunk));
        },
        close() {
          fileStream.end();
        },
      }),
    );
  } catch (error) {
    const err = error as Error;
    console.error('Error downloading file:', err);
    throw error;
  }
}

// return location of downloaded file
export const downloadFileWithCache = async (
  url: string,
  targetPath: string | null = null,
): Promise<string> => {
  const parsedUrl = new URL(url);
  const downloadPath =
    targetPath ||
    `${TMP_DIR}/downloads/${parsedUrl.hostname}${parsedUrl.pathname}`;

  if (!isFile(downloadPath)) {
    await ensureDirectoryExists(dirname(downloadPath));
    await download(url, downloadPath);
  }
  return downloadPath;
};

interface ListFilesOptions {
  match?: RegExp;
}

export const listFiles = async (
  dirPath: string,
  options: ListFilesOptions = { match: /.*/ },
): Promise<string[]> => {
  const entries: Dirent[] = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry: Dirent) => entry.isFile())
    .map((entry: Dirent) => entry.name);

  return options.match
    ? files.filter((item) => options.match?.test(item))
    : files;
};

export async function getCached(file: string, expiry: number = 300000) {
  const cacheFile = path.resolve(TMP_DIR, file);
  const cached = existsSync(cacheFile);
  if (cached) {
    const stats = statSync(cacheFile);
    const modTime = new Date(stats.mtime);
    const now = new Date();
    const isExpired = expiry && now.getTime() - modTime.getTime() > expiry;
    if (!isExpired) {
      return await readFile(cacheFile, 'utf8');
    }
  }
}

export async function setCached(file: string, data: string) {
  const cacheFile = path.resolve(TMP_DIR, file);
  await ensureDirectoryExists(path.dirname(cacheFile));
  await writeFile(cacheFile, data);
}

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  // Add more mappings as needed
};

export function getMimeType(fileOrUrl: string): string {
  const urlPattern = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//; // Matches any valid URL scheme
  let extension: string;

  if (urlPattern.test(fileOrUrl)) {
    // It's a URL, extract the pathname
    const url = new URL(fileOrUrl);
    extension = path.extname(url.pathname);
  } else {
    // It's a file path
    extension = path.extname(fileOrUrl);
  }

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

export * from './fetch';
export * from './filesystem';
