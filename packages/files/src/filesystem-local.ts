import { FilesystemAdapter, FilesystemAdapterOptions } from './filesystem';

export class LocalFilesystemAdapter extends FilesystemAdapter {
  protected cacheDir: string;
  public type: string;
  protected options: FilesystemAdapterOptions;
  constructor(options: FilesystemAdapterOptions) {
    this.options = options;
    this.type = options.type || 'local';
    this.cacheDir = options.cacheDir || '.cache';
  }

  static async createFromUrl(url: string) {}

  static async create(options: FilesystemAdapterOptions) {}

  async exists(path: string) {
    return false;
  }

  async read(path: string) {
    return '';
  }

  async write(path: string, content: string) {
    return;
  }

  async delete(path: string) {
    return;
  }

  async list(path: string) {
    return [];
  }

  async mimeType(path: string) {
    const extension = path.slice(((path.lastIndexOf('.') - 1) >>> 0) + 2);
    return getMimeType(`.${extension}`);
  }
}
