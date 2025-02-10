import type { BaseObjectOptions } from './object';
import { BaseObject } from './object';

export interface ContentOptions extends BaseObjectOptions {
  type?: string | null;
  fileKey?: string | null;
  author?: string | null;
  title?: string | null;
  body?: string | null;
  publish_date?: Date | null;
  url?: string | null;
  source?: string | null;
}

export class Content extends BaseObject<ContentOptions> {
  protected options: ContentOptions;
  protected references: Content[] = [];
  public type?: string | null;
  public fileKey: string | null | undefined;
  public author!: string | null | undefined;
  public title!: string | null | undefined;
  public body!: string | null | undefined;
  public publish_date!: Date | null | undefined;
  public url!: string | null | undefined;
  public source!: string | null | undefined;

  constructor(options: ContentOptions) {
    super(options);
    this.options = options;
    this.type = options.type || null;
    this.name = options.title || '';
    this.author = options.author || null;
    this.title = options.title || '';
    this.body = options.body || '';
    this.publish_date = options.publish_date || null;
    this.fileKey = options.fileKey || null;
    this.url = options.url || null;
    this.source = options.source || null;
  }

  static async create(options: ContentOptions) {
    if (!options.db) {
      options.db = {
        url: process.env.CONTENT_DB_URL || process.env.KISSD_DB_URL,
      };
    }
    const content = new Content(options);
    await content.initialize();
    return content;
  }

  async initialize() {
    await super.initialize();
  }

  public async loadReferences() {}

  public async addReference(content: Content | string) {
    if (typeof content === 'string') {
      content = await Content.create({
        db: this.options.db,
        ai: this.options.ai,
        url: content,
      });
    }
    this.references.push(content);
  }

  public async getReferences() {
    return this.references;
  }
}
