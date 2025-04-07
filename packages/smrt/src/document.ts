import os from 'os';
import path from 'path';
import { URL } from 'url';
import { FilesystemAdapter } from '@have/files';
import { downloadFileWithCache } from '@have/files';
import { extractTextFromPDF } from '@have/pdf';
import { getCached, setCached, getMimeType } from '@have/files';
import { makeSlug } from '@have/utils';
export interface DocumentOptions {
  fs?: FilesystemAdapter;
  cacheDir?: string;
  url: string;
  localPath?: string;
  type?: string | undefined | null;
}

export class Document {
  protected isRemote: boolean;
  protected options: DocumentOptions;
  protected localPath: string;
  protected cacheDir: string;
  public url: URL;
  public type: string | undefined | null;
  constructor(options: DocumentOptions) {
    this.options = options;
    this.url = new URL(options.url);

    this.type = options.type || getMimeType(this.url.toString());
    this.cacheDir =
      options.cacheDir || path.resolve(os.tmpdir(), '.cache', 'have-sdk');

    if (this.url.protocol.startsWith('file')) {
      this.localPath = this.url.pathname;
      this.isRemote = false;
    } else {
      this.localPath = path.join(
        this.cacheDir,
        makeSlug(this.url.hostname),
        this.url.pathname,
      );
      this.isRemote = true;
    }
  }

  static async create(options: DocumentOptions) {
    const document = new Document(options);
    await document.initialize();
    return document;
  }

  async initialize() {
    if (this.isRemote) {
      //todo: should be getCached?
      await downloadFileWithCache(this.url.toString(), this.localPath);
    }
  }

  async getText() {
    const cached = await getCached(this.localPath + '.extracted_text');
    if (cached) {
      return cached;
    }

    let extracted: string | null = '';
    switch (this.type) {
      case 'application/pdf':
        extracted = await extractTextFromPDF(this.localPath);
        break;
      case 'text':
      case 'json':
      default:
        throw new Error(
          'Getting text from ${this.type} types not yet implemented. I should check to see if its a text file here',
        );
    }
    if (extracted) {
      await setCached(this.localPath + '.extracted_text', extracted);
    }
    return extracted;
  }
}

export default {
  File,
};
