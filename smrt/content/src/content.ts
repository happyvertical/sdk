import type { BaseObjectOptions } from '@have/smrt';
import { BaseObject, smrt } from '@have/smrt';

/**
 * Options for Content initialization
 */
export interface ContentOptions extends BaseObjectOptions {
  /**
   * Content type classification
   */
  type?: string | null;
  
  /**
   * Reference to file storage key
   */
  fileKey?: string | null;
  
  /**
   * Author of the content
   */
  author?: string | null;
  
  /**
   * Content title
   */
  title?: string | null;
  
  /**
   * Short description or summary
   */
  description?: string | null;
  
  /**
   * Main content body text
   */
  body?: string | null;
  
  /**
   * Date when content was published
   */
  publish_date?: Date | null;
  
  /**
   * URL source of the content
   */
  url?: string | null;
  
  /**
   * Original source identifier
   */
  source?: string | null;
  
  /**
   * Publication status
   */
  status?: 'published' | 'draft' | 'archived' | 'deleted' | null;
  
  /**
   * Content state flag
   */
  state?: 'deprecated' | 'active' | 'highlighted' | null;
}

/**
 * Structured content object with metadata and body text
 *
 * Content represents any text-based content with metadata such as
 * title, author, description, and publishing information. It supports
 * referencing related content objects.
 */
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update', 'delete'] // Full CRUD operations
  },
  mcp: {
    include: ['list', 'get', 'create', 'update'] // AI tools for content management
  },
  cli: true // Enable CLI commands for content management
})
export class Content extends BaseObject {
  /**
   * Array of referenced content objects
   */
  protected references: Content[] = [];
  
  /**
   * Content type classification
   */
  public type: string | null = null;

  /**
   * Reference to file storage key
   */
  public fileKey: string | null = null;

  /**
   * Author of the content
   */
  public author: string | null = null;

  /**
   * Content title
   */
  public title: string = '';

  /**
   * Short description or summary
   */
  public description: string | null = null;

  /**
   * Main content body text
   */
  public body: string = '';

  /**
   * Date when content was published
   */
  public publish_date: Date | null = null;

  /**
   * URL source of the content
   */
  public url: string | null = null;

  /**
   * Original source identifier
   */
  public source: string | null = null;

  /**
   * Publication status
   */
  public status: 'published' | 'draft' | 'archived' | 'deleted' = 'draft';

  /**
   * Content state flag
   */
  public state: 'deprecated' | 'active' | 'highlighted' = 'active';
  
  constructor(options: any = {}) {
    super(options);

    // Assign properties with proper defaults
    this.type = options.type ?? null;
    this.fileKey = options.fileKey ?? null;
    this.author = options.author ?? null;
    this.title = options.title ?? '';
    this.description = options.description ?? null;
    this.body = options.body ?? '';
    this.publish_date = options.publish_date ?? null;
    this.url = options.url ?? null;
    this.source = options.source ?? null;
    this.status = options.status ?? 'draft';
    this.state = options.state ?? 'active';

    // Set name to title for BaseObject compatibility
    this.name = this.title;
  }


  /**
   * Initializes this content object
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize() {
    await super.initialize();
  }

  /**
   * Loads referenced content objects
   * 
   * @returns Promise that resolves when references are loaded
   */
  public async loadReferences() {}

  /**
   * Adds a reference to another content object
   *
   * @param content - Content object or URL to reference
   * @returns Promise that resolves when the reference is added
   */
  public async addReference(content: Content | string) {
    if (typeof content === 'string') {
      content = new Content({
        url: content,
      });
      await content.initialize();
    }
    this.references.push(content);
  }

  /**
   * Gets all referenced content objects
   * 
   * @returns Promise resolving to an array of referenced Content objects
   */
  public async getReferences() {
    return this.references;
  }

  /**
   * Converts this content object to a plain JSON object
   * 
   * @returns JSON representation of this content
   */
  public toJSON() {
    return {
      id: this.id || '',
      slug: this.slug || '',
      context: this.context || '',
      type: this.type,
      fileKey: this.fileKey || '',
      author: this.author || '',
      title: this.title || '',
      description: this.description || '',
      body: this.body || '',
      publish_date: this.publish_date || '',
      url: this.url || '',
      source: this.source || '',
      status: this.status || 'draft',
      state: this.state || 'active',
    };
  }
}
