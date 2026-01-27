/**
 * Threads (Meta) Adapter
 *
 * Implements SocialPlatform interface for Threads publishing.
 * Uses Meta Graph API.
 */

import { createLogger } from '@happyvertical/logger';

import type {
  AuthResult,
  ImagePost,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostResult,
  SocialPlatform,
  TextPost,
  ThreadsConfig,
  VideoPost,
} from '../types.js';
import {
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
} from '../types.js';

const THREADS_API_URL = 'https://graph.threads.net/v1.0';

/**
 * Threads adapter for publishing via Meta Graph API
 *
 * @example
 * ```typescript
 * const threads = new ThreadsAdapter({
 *   type: 'threads',
 *   accessToken: 'user-access-token',
 *   userId: 'threads-user-id',
 * });
 *
 * await threads.authenticate();
 *
 * const result = await threads.publishText({
 *   text: 'Breaking news from Bentley!',
 *   linkUrl: 'https://example.com/article',
 * });
 * ```
 */
export class ThreadsAdapter implements SocialPlatform {
  readonly platform = 'threads' as const;
  private config: ThreadsConfig;

  constructor(config: ThreadsConfig) {
    this.config = config;
    this.logger = createLogger({ level: 'info' });
  }

  async authenticate(): Promise<AuthResult> {
    // Verify token by getting user profile
    const response = await fetch(
      `${THREADS_API_URL}/${this.config.userId}?fields=id,username&access_token=${this.config.accessToken}`,
    );

    if (!response.ok) {
      const error = await response.json();
      throw new SocialAuthError(
        'threads',
        error.error?.message ?? 'Authentication failed',
      );
    }

    return {
      accessToken: this.config.accessToken,
    };
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    // Threads uses long-lived tokens from Meta OAuth
    // Token refresh is handled through Meta's token exchange
    throw new SocialError(
      'Use Meta OAuth token exchange for refresh',
      'NOT_IMPLEMENTED',
      'threads',
    );
  }

  async publishVideo(video: VideoPost): Promise<PostResult> {
    // Step 1: Create media container
    const text = this.buildPostText(
      video.description,
      video.tags,
      video.linkUrl,
    );

    // For video, we need a URL (can't upload buffer directly)
    const videoUrl = Buffer.isBuffer(video.file)
      ? await this.uploadToTempStorage(video.file, 'video/mp4')
      : video.file;

    const containerResponse = await fetch(
      `${THREADS_API_URL}/${this.config.userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'VIDEO',
          video_url: videoUrl,
          text,
          access_token: this.config.accessToken,
        }),
      },
    );

    if (!containerResponse.ok) {
      await this.handleError(containerResponse);
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    // Step 2: Wait for container to be ready
    await this.waitForContainer(containerId);

    // Step 3: Publish the container
    return this.publishContainer(containerId);
  }

  async publishImage(image: ImagePost): Promise<PostResult> {
    // Step 1: Create media container
    const text = this.buildPostText(
      image.description,
      image.tags,
      image.linkUrl,
    );

    // For image, we need a URL
    const imageUrl = Buffer.isBuffer(image.file)
      ? await this.uploadToTempStorage(image.file, 'image/png')
      : image.file;

    const containerResponse = await fetch(
      `${THREADS_API_URL}/${this.config.userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'IMAGE',
          image_url: imageUrl,
          text,
          access_token: this.config.accessToken,
        }),
      },
    );

    if (!containerResponse.ok) {
      await this.handleError(containerResponse);
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    // Step 2: Wait for container to be ready
    await this.waitForContainer(containerId);

    // Step 3: Publish the container
    return this.publishContainer(containerId);
  }

  async publishText(text: TextPost): Promise<PostResult> {
    const postText = this.buildPostText(text.text, text.tags, text.linkUrl);

    // Step 1: Create text container
    const body: Record<string, any> = {
      media_type: 'TEXT',
      text: postText,
      access_token: this.config.accessToken,
    };

    // Handle reply
    if (text.replyTo) {
      body.reply_to_id = text.replyTo;
    }

    const containerResponse = await fetch(
      `${THREADS_API_URL}/${this.config.userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!containerResponse.ok) {
      await this.handleError(containerResponse);
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    // Step 2: Publish the container (text doesn't need processing wait)
    return this.publishContainer(containerId);
  }

  /**
   * Wait for media container to finish processing
   */
  private async waitForContainer(containerId: string): Promise<void> {
    let checkCount = 0;
    const maxChecks = 60; // 5 minutes max

    while (checkCount < maxChecks) {
      const statusResponse = await fetch(
        `${THREADS_API_URL}/${containerId}?fields=status&access_token=${this.config.accessToken}`,
      );

      if (!statusResponse.ok) {
        throw new SocialError(
          'Failed to check container status',
          'STATUS_CHECK_FAILED',
          'threads',
        );
      }

      const statusData = await statusResponse.json();

      if (statusData.status === 'FINISHED') {
        return;
      }

      if (statusData.status === 'ERROR') {
        throw new SocialError(
          'Media processing failed',
          'PROCESSING_FAILED',
          'threads',
        );
      }

      // IN_PROGRESS - wait and check again
      await new Promise((resolve) => setTimeout(resolve, 5000));
      checkCount++;
    }

    throw new SocialError(
      'Media processing timeout',
      'PROCESSING_TIMEOUT',
      'threads',
    );
  }

  /**
   * Publish a prepared container
   */
  private async publishContainer(containerId: string): Promise<PostResult> {
    const publishResponse = await fetch(
      `${THREADS_API_URL}/${this.config.userId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: this.config.accessToken,
        }),
      },
    );

    if (!publishResponse.ok) {
      await this.handleError(publishResponse);
    }

    const publishData = await publishResponse.json();

    // Get the published thread details
    const threadResponse = await fetch(
      `${THREADS_API_URL}/${publishData.id}?fields=id,permalink&access_token=${this.config.accessToken}`,
    );

    const threadData = await threadResponse.json();

    return {
      id: publishData.id,
      url:
        threadData.permalink ??
        `https://www.threads.net/@${this.config.userId}/post/${publishData.id}`,
      status: 'published',
      publishedAt: new Date(),
    };
  }

  /**
   * Upload buffer to temporary storage and return URL
   * Note: In production, this would upload to a CDN or storage service
   */
  private async uploadToTempStorage(
    _buffer: Buffer,
    _mimeType: string,
  ): Promise<string> {
    // Threads requires a publicly accessible URL for media
    // This would typically upload to S3, CloudFlare R2, etc.
    throw new SocialError(
      'Buffer upload requires external storage configuration. Provide a URL instead.',
      'NOT_IMPLEMENTED',
      'threads',
    );
  }

  async getPost(postId: string): Promise<Post> {
    const response = await fetch(
      `${THREADS_API_URL}/${postId}?fields=id,text,timestamp,media_type,permalink&access_token=${this.config.accessToken}`,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();

    // Get insights separately
    let analytics: PostAnalytics = {};
    try {
      const insightsResponse = await fetch(
        `${THREADS_API_URL}/${postId}/insights?metric=views,likes,replies,reposts&access_token=${this.config.accessToken}`,
      );
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        analytics = this.parseInsights(insightsData.data);
      }
    } catch {
      // Insights may not be available for all posts
    }

    return {
      id: data.id,
      url: data.permalink,
      type: this.mapMediaType(data.media_type),
      description: data.text,
      publishedAt: new Date(data.timestamp),
      visibility: 'public',
      analytics,
    };
  }

  async deletePost(_postId: string): Promise<void> {
    // Threads API currently doesn't support deletion via API
    // Posts must be deleted manually
    throw new SocialError(
      'Threads does not support programmatic post deletion',
      'NOT_SUPPORTED',
      'threads',
    );
  }

  async getAnalytics(postId: string): Promise<PostAnalytics> {
    const response = await fetch(
      `${THREADS_API_URL}/${postId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${this.config.accessToken}`,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return this.parseInsights(data.data);
  }

  getCapabilities(): PlatformCapabilities {
    return {
      video: true,
      image: true,
      text: true,
      scheduling: false,
      analytics: true,
      maxVideoLength: 300, // 5 minutes
      maxVideoSize: 1024 * 1024 * 1024, // 1GB
      supportedVideoFormats: ['mp4', 'mov'],
      aspectRatios: ['1:1', '4:5', '9:16'],
      maxTextLength: 500,
      maxHashtags: undefined,
    };
  }

  /**
   * Build post text with hashtags and link
   */
  private buildPostText(
    text?: string,
    tags?: string[],
    linkUrl?: string,
  ): string {
    let result = text ?? '';

    if (linkUrl && !result.includes(linkUrl)) {
      result += `\n\n${linkUrl}`;
    }

    if (tags && tags.length > 0) {
      const hashtags = tags.map((t) => (t.startsWith('#') ? t : `#${t}`));
      result += `\n\n${hashtags.join(' ')}`;
    }

    // Truncate to 500 chars
    if (result.length > 500) {
      result = `${result.substring(0, 497)}...`;
    }

    return result;
  }

  /**
   * Parse insights data into PostAnalytics
   */
  private parseInsights(insights: any[]): PostAnalytics {
    const analytics: PostAnalytics = {};

    for (const insight of insights) {
      switch (insight.name) {
        case 'views':
          analytics.views = insight.values?.[0]?.value ?? 0;
          break;
        case 'likes':
          analytics.likes = insight.values?.[0]?.value ?? 0;
          break;
        case 'replies':
          analytics.comments = insight.values?.[0]?.value ?? 0;
          break;
        case 'reposts':
        case 'quotes':
          analytics.shares =
            (analytics.shares ?? 0) + (insight.values?.[0]?.value ?? 0);
          break;
      }
    }

    analytics.lastUpdated = new Date();
    return analytics;
  }

  /**
   * Map Threads media type to our type
   */
  private mapMediaType(mediaType: string): 'video' | 'image' | 'text' {
    switch (mediaType) {
      case 'VIDEO':
        return 'video';
      case 'IMAGE':
      case 'CAROUSEL_ALBUM':
        return 'image';
      default:
        return 'text';
    }
  }

  /**
   * Handle API errors
   */
  private async handleError(response: Response): Promise<never> {
    const text = await response.text();
    let error;
    try {
      error = JSON.parse(text);
    } catch {
      error = { error: { message: text } };
    }

    if (response.status === 401 || error.error?.code === 190) {
      throw new SocialAuthError(
        'threads',
        error.error?.message ?? 'Unauthorized',
      );
    }

    if (response.status === 429 || error.error?.code === 4) {
      throw new SocialRateLimitError('threads');
    }

    throw new SocialError(
      error.error?.message ?? 'API request failed',
      error.error?.code?.toString() ?? 'API_ERROR',
      'threads',
      response.status,
    );
  }
}
