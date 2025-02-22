import type { AIClientOptions } from '@have/ai';
import type { BaseCollectionOptions } from './collection.js';
import YAML from 'yaml';
import { makeSlug } from '@have/utils';
import { BaseCollection } from './collection.js';
import { Content } from './content.js';
import { Document } from './document.js';
import path from 'path';
import { ensureDirectoryExists } from '@have/files';
import { writeFile } from 'node:fs/promises';

export interface ContentsOptions extends BaseCollectionOptions {
  ai?: AIClientOptions;
  contentDir?: string;
}

export class Contents extends BaseCollection<Content> {
  static _itemClass = Content;
  public options: ContentsOptions = {} as ContentsOptions;
  private exampleContent!: Content;
  private loaded: Map<string, Content>;
  public contentDir?: string;

  static async create(options: ContentsOptions): Promise<Contents> {
    const contents = new Contents(options);
    await contents.initialize();
    return contents;
  }

  constructor(options: ContentsOptions) {
    super(options);
    this.options = options; //needed cause redeclare above i think ?
    this.loaded = new Map();
  }

  getDb() {
    return this._db;
  }

  public async initialize(): Promise<void> {
    await super.initialize();
  }

  // todo: param to force refresh
  // todo: check age of mirror and if older than x check for updates
  public async mirror(options: { url: string; mirrorDir?: string }) {
    if (!options.url) {
      throw new Error('No URL provided');
    }
    let url: URL;
    try {
      // const url = new URL(options.url);
      // const existing = await this.db
      //   .oO`SELECT * FROM contents WHERE url = ${options.url}`;
      url = new URL(options.url); // validate url
    } catch (error) {
      console.error(error);
      throw new Error(`Invalid URL provided: ${options.url}`);
    }
    const existing = await this.get({ url: options.url });
    if (existing) {
      return existing;
    }

    const doc = await Document.create({
      cacheDir: options?.mirrorDir,
      url: options.url,
    });

    const filename = url.pathname.split('/').pop();
    const nameWithoutExtension = filename?.replace(/\.[^/.]+$/, '');
    const title = nameWithoutExtension?.replace(/[-_]/g, ' ');
    const slug = makeSlug(title as string);
    const body = await doc.getText();
    if (body) {
      const content = await Content.create({
        db: this.options.db,
        ai: this.options.ai,
        url: options.url,
        type: 'mirror',
        title,
        slug,
        context: '',
        body,
      });

      await content.save();
      return content;
    }
  }

  public async writeContentFile(options: {
    content: Content;
    contentDir: string;
  }) {
    const { content, contentDir } = options;
    if (!contentDir) {
      throw new Error('No content dir provided');
    }

    const { body } = content;
    const frontMatter = {
      title: content.title,
      slug: content.slug,
      context: content.context,
      author: content.author,
      publish_date: content.publish_date,
    };

    let output = '';
    if (frontMatter && Object.keys(frontMatter).length > 0) {
      output += '---\n';
      output += YAML.stringify(frontMatter);
      output += '---\n';
    }

    // Format body as markdown if it's plain text
    let formattedBody = body || '';
    if (body && !this.isMarkdown(body)) {
      formattedBody = this.formatAsMarkdown(body);
    }
    output += formattedBody;

    const pathParts = [
      contentDir,
      content.context || '', // if empty, use empty string
      content.slug,
      'index.md',
    ].filter(Boolean); // remove empty strings

    const outputFile = path.join(...(pathParts as string[]));
    await ensureDirectoryExists(path.dirname(outputFile));
    await writeFile(outputFile, output);
  }

  private isMarkdown(text: string): boolean {
    // Basic check for common markdown indicators
    const markdownIndicators = [
      /^#\s/m, // Headers
      /\*\*.+\*\*/, // Bold
      /\*.+\*/, // Italic
      /\[.+\]\(.+\)/, // Links
      /^\s*[-*+]\s/m, // Lists
      /^\s*\d+\.\s/m, // Numbered lists
      /```[\s\S]*```/, // Code blocks
      /^\s*>/m, // Blockquotes
    ];

    return markdownIndicators.some((indicator) => indicator.test(text));
  }

  private formatAsMarkdown(text: string): string {
    // Basic formatting of plain text to markdown
    return text
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  public async syncContentDir(options: { contentDir?: string }) {
    const contentFilter = {
      type: 'article',
    };

    const contents = await this.list({ filter: contentFilter });
    for (const content of contents) {
      await this.writeContentFile({
        content,
        contentDir: options.contentDir || this.options.contentDir || '',
      });
    }
    // const files = await fs.readdir(dir);
  }
}
