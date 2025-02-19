import { Field } from './fields.js';
import type { BaseObjectOptions } from './object.js';
import { BaseObject } from './object.js';

export interface ContentOptions extends BaseObjectOptions {
  type?: string | null;
  fileKey?: string | null;
  author?: string | null;
  title?: string | null;
  description?: string | null;
  body?: string | null;
  publish_date?: Date | null;
  url?: string | null;
  source?: string | null;
  status?: 'published' | 'draft' | 'archived' | 'deleted' | null;
}

export class Content extends BaseObject<ContentOptions> {
  protected options: ContentOptions;
  protected references: Content[] = [];
  public type?: string | null;
  public fileKey: string | null | undefined;
  public author!: string | null | undefined;
  public title!: string | null | undefined;
  public description!: string | null | undefined;
  public body!: string | null | undefined;
  public publish_date!: Date | null | undefined;
  public url!: string | null | undefined;
  public source!: string | null | undefined;
  public status!: 'published' | 'draft' | 'archived' | 'deleted' | null;
  constructor(options: ContentOptions) {
    super(options);
    this.options = options;
    this.type = options.type || null;
    this.name = options.title || '';
    this.author = options.author || null;
    this.title = options.title || '';
    this.description = options.description || null;
    this.body = options.body || '';
    this.publish_date = options.publish_date || null;
    this.fileKey = options.fileKey || null;
    this.url = options.url || null;
    this.source = options.source || null;
    this.status = options.status || 'draft';
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

  toJSON() {
    return {
      type: this.type,
      fileKey: this.fileKey,
      author: this.author,
      title: this.title,
      description: this.description,
      body: this.body,
      publish_date: this.publish_date,
      url: this.url,
      source: this.source,
      status: this.status,
    };
  }
}
