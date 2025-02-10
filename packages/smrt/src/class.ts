import { getDatabase } from '@have/sql';
import type { DatabaseOptions, DatabaseInterface } from '@have/sql';
import { FilesystemAdapter } from '@have/files';
import type { FilesystemAdapterOptions } from '@have/files';
import type { AIClientOptions } from '@have/ai';
import { AIClient } from '@have/ai';

export interface BaseClassOptions {
  _className?: string;
  db?: DatabaseOptions;
  fs?: FilesystemAdapterOptions;
  ai?: AIClientOptions;
}

export class BaseClass<T extends BaseClassOptions = BaseClassOptions> {
  protected _ai!: AIClient;
  protected _fs!: FilesystemAdapter;
  protected _db!: DatabaseInterface;
  protected _className!: string;
  protected options: T;

  constructor(options: T) {
    this.options = options;
    this._className = this.constructor.name;
  }

  protected async initialize(): Promise<void> {
    if (this.options.db) {
      this._db = await getDatabase(this.options.db);
    }
    if (this.options.fs) {
      this._fs = await FilesystemAdapter.create(this.options.fs);
    }
    if (this.options.ai) {
      this._ai = await AIClient.create(this.options.ai);
    }
  }

  // Getter for fs
  get fs() {
    return this._fs;
  }

  // Getter for db
  get db() {
    return this._db;
  }

  // Getter for ai
  get ai() {
    return this._ai;
  }
}
