import path from 'path';
import os from 'os';
import { mkdir } from 'fs/promises';
import { getCached, setCached } from './index.js';

export interface FilesystemAdapterInterface {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
  mimeType(path: string): Promise<string>;
}

export interface FilesystemAdapterOptions {
  type?: string;
  cacheDir?: string;
}

export class FilesystemAdapter {
  protected options: FilesystemAdapterOptions;
  protected cacheDir: string;

  constructor(options: FilesystemAdapterOptions) {
    this.options = options;
    this.cacheDir =
      options.cacheDir || path.join(os.tmpdir(), 'have-sdk', '.cache');
  }

  static async create<T extends FilesystemAdapterOptions>(
    options: T,
  ): Promise<FilesystemAdapter> {
    const fs = new FilesystemAdapter(options);
    await fs.initialize();
    return fs;
  }

  protected async initialize() {
    await mkdir(this.cacheDir, { recursive: true });
  }

  async download(
    url: string,
    options: {
      force: boolean;
    } = {
      force: false,
    },
  ): Promise<string> {
    return '';
  }

  async exists(path: string): Promise<boolean> {
    // Dummy implementation
    return false;
  }

  async read(path: string): Promise<string> {
    // Dummy implementation
    return '';
  }

  async write(path: string, content: string): Promise<void> {
    // Dummy implementation
  }

  async delete(path: string): Promise<void> {
    // Dummy implementation
  }

  async list(path: string): Promise<string[]> {
    // Dummy implementation
    return [];
  }

  async getCached(file: string, expiry: number = 300000) {
    return getCached(file, expiry);
  }

  async setCached(file: string, data: string) {
    return setCached(file, data);
  }
}
