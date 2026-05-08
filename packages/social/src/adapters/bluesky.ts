/**
 * Bluesky Adapter
 *
 * Implements SocialPlatform interface for Bluesky (AT Protocol) publishing.
 */

import {
  createSafetyResult,
  isPublicPublishMode,
  resolvePublishMode,
} from '../safety.js';
import type {
  AuthResult,
  BlueskyConfig,
  ImagePost,
  LinkPost,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostResult,
  SocialPlatform,
  TextPost,
  VideoPost,
} from '../types.js';
import {
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
} from '../types.js';

const DEFAULT_PDS = 'https://bsky.social';

type BlueskyPostRecord = Record<string, unknown> & {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
};

interface BlueskyReplyRef {
  root: {
    uri: string;
    cid: string;
  };
  parent: {
    uri: string;
    cid: string;
  };
}

interface BlueskyApiError {
  message?: string;
  error?: string;
}

/**
 * Bluesky adapter for publishing via AT Protocol
 *
 * @example
 * ```typescript
 * const bluesky = new BlueskyAdapter({
 *   type: 'bluesky',
 *   identifier: 'myhandle.bsky.social',
 *   password: 'app-password', // Use app password, not main password
 * });
 *
 * await bluesky.authenticate();
 *
 * const result = await bluesky.publishText({
 *   text: 'Breaking news from Bentley!',
 *   linkUrl: 'https://example.com/article',
 * });
 * ```
 */
export class BlueskyAdapter implements SocialPlatform {
  readonly platform = 'bluesky' as const;
  private config: BlueskyConfig;
  private session?: {
    did: string;
    handle: string;
    accessJwt: string;
    refreshJwt: string;
  };

  constructor(config: BlueskyConfig) {
    this.config = config;
  }

  private get pdsUrl(): string {
    return this.config.pdsUrl ?? DEFAULT_PDS;
  }

  async authenticate(): Promise<AuthResult> {
    const response = await fetch(
      `${this.pdsUrl}/xrpc/com.atproto.server.createSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: this.config.identifier,
          password: this.config.password,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new SocialAuthError(
        'bluesky',
        error.message ?? 'Authentication failed',
      );
    }

    const data = await response.json();

    this.session = {
      did: data.did,
      handle: data.handle,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
    };

    return {
      accessToken: data.accessJwt,
      refreshToken: data.refreshJwt,
    };
  }

  async refreshToken(refreshJwt: string): Promise<AuthResult> {
    const response = await fetch(
      `${this.pdsUrl}/xrpc/com.atproto.server.refreshSession`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshJwt}`,
        },
      },
    );

    if (!response.ok) {
      throw new SocialAuthError('bluesky', 'Session refresh failed');
    }

    const data = await response.json();

    this.session = {
      did: data.did,
      handle: data.handle,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
    };

    return {
      accessToken: data.accessJwt,
      refreshToken: data.refreshJwt,
    };
  }

  async publishVideo(video: VideoPost): Promise<PostResult> {
    // Bluesky supports video via embed
    // For now, post with link to video
    const text = this.buildPostText(
      video.description,
      video.tags,
      video.linkUrl,
    );

    return this.publishText({
      text,
      linkUrl: video.linkUrl,
    });
  }

  async publishImage(image: ImagePost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const text = this.buildPostText(
      image.description,
      image.tags,
      image.linkUrl,
    );

    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'image',
        payload: {
          text,
          altText: image.altText,
          linkUrl: image.linkUrl,
        },
        note: 'Bluesky dry run: blob was not uploaded and no post was created.',
      });
    }

    if (!this.session) {
      await this.authenticate();
    }

    // Upload blob first
    const imageData = Buffer.isBuffer(image.file)
      ? image.file
      : await fetch(image.file)
          .then((r) => r.arrayBuffer())
          .then(Buffer.from);

    const blobResponse = await fetch(
      `${this.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.session?.accessJwt}`,
          'Content-Type': 'image/png',
        },
        body: new Uint8Array(imageData),
      },
    );

    if (!blobResponse.ok) {
      await this.handleError(blobResponse);
    }

    const blobData = await blobResponse.json();

    if (!isPublicPublishMode(publishMode)) {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'image',
        payload: {
          text,
          altText: image.altText,
          blob: blobData.blob,
          linkUrl: image.linkUrl,
        },
        remoteId: blobData.blob?.ref?.$link ?? blobData.blob?.cid,
        staged: true,
        note: 'Bluesky blob uploaded but no post record was created.',
      });
    }

    // Create post with image embed
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            alt: image.altText ?? '',
            image: blobData.blob,
          },
        ],
      },
    };

    return this.createPost(record);
  }

  async publishText(text: TextPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const postText = this.buildPostText(text.text, text.tags);

    const record: BlueskyPostRecord = {
      $type: 'app.bsky.feed.post',
      text: postText,
      createdAt: new Date().toISOString(),
    };

    // Add link card if URL provided
    if (text.linkUrl) {
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: text.linkUrl,
          title: '', // Would need to fetch
          description: '',
        },
      };

      // Also add link facets for proper link rendering
      const urlStart = postText.indexOf(text.linkUrl);
      if (urlStart >= 0) {
        record.facets = [
          {
            index: {
              byteStart: urlStart,
              byteEnd: urlStart + text.linkUrl.length,
            },
            features: [
              {
                $type: 'app.bsky.richtext.facet#link',
                uri: text.linkUrl,
              },
            ],
          },
        ];
      }
    }

    if (!isPublicPublishMode(publishMode)) {
      if (text.replyTo) {
        record.replyTo = text.replyTo;
      }
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'text',
        payload: record,
        note:
          publishMode === 'dry_run'
            ? 'Bluesky dry run: no post record was created.'
            : 'Bluesky has no non-public text staging endpoint; no post record was created.',
      });
    }

    if (!this.session) {
      await this.authenticate();
    }

    // Handle reply
    if (text.replyTo) {
      record.reply = await this.getReplyRef(text.replyTo);
    }

    return this.createPost(record);
  }

  async publishLink(link: LinkPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const postText = this.buildPostText(
      link.text ?? link.title ?? link.description ?? link.url,
      link.tags,
    );

    const record: BlueskyPostRecord = {
      $type: 'app.bsky.feed.post',
      text: postText,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: link.url,
          title: link.title ?? link.url,
          description: link.description ?? '',
        },
      },
    };

    if (!isPublicPublishMode(publishMode)) {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'link',
        payload: record,
        note:
          publishMode === 'dry_run'
            ? 'Bluesky dry run: no post record was created.'
            : 'Bluesky has no non-public link staging endpoint; no post record was created.',
      });
    }

    if (!this.session) {
      await this.authenticate();
    }

    return this.createPost(record);
  }

  private async createPost(record: unknown): Promise<PostResult> {
    const response = await fetch(
      `${this.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.session?.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: this.session?.did,
          collection: 'app.bsky.feed.post',
          record,
        }),
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();

    // Build AT URI for the post
    const postId = data.uri.split('/').pop();

    return {
      id: data.uri,
      url: `https://bsky.app/profile/${this.session?.handle}/post/${postId}`,
      status: 'published',
      publishedAt: new Date(),
      metadata: { publishMode: resolvePublishMode(this.config) },
    };
  }

  async getPost(postId: string): Promise<Post> {
    if (!this.session) {
      await this.authenticate();
    }

    // postId should be the AT URI or rkey
    const uri = postId.startsWith('at://')
      ? postId
      : `at://${this.session?.did}/app.bsky.feed.post/${postId}`;

    const response = await fetch(
      `${this.pdsUrl}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`,
      {
        headers: { Authorization: `Bearer ${this.session?.accessJwt}` },
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const post = data.thread.post;

    return {
      id: post.uri,
      url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
      type: 'text',
      description: post.record.text,
      publishedAt: new Date(post.record.createdAt),
      visibility: 'public',
      analytics: {
        likes: post.likeCount,
        shares: post.repostCount,
        comments: post.replyCount,
        lastUpdated: new Date(),
        raw: {
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          replyCount: post.replyCount,
          quoteCount: post.quoteCount,
        },
      },
    };
  }

  async deletePost(postId: string): Promise<void> {
    if (!this.session) {
      await this.authenticate();
    }

    const rkey = postId.includes('/') ? postId.split('/').pop() : postId;

    const response = await fetch(
      `${this.pdsUrl}/xrpc/com.atproto.repo.deleteRecord`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.session?.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: this.session?.did,
          collection: 'app.bsky.feed.post',
          rkey,
        }),
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }
  }

  async getAnalytics(postId: string): Promise<PostAnalytics> {
    const post = await this.getPost(postId);
    return post.analytics ?? {};
  }

  getCapabilities(): PlatformCapabilities {
    return {
      video: false, // Limited video support
      image: true,
      text: true,
      link: true,
      linkAttachment: true,
      scheduling: false,
      analytics: true,
      rawAnalytics: true,
      publishModes: ['dry_run', 'stage_remote', 'public'],
      staging: true,
      privatePublishing: false,
      maxVideoLength: 0,
      maxVideoSize: 0,
      supportedVideoFormats: [],
      aspectRatios: ['1:1', '16:9', '4:3'],
      maxTextLength: 300,
      maxHashtags: undefined, // No limit
      supportedPostTypes: ['text', 'image', 'link'],
    };
  }

  /**
   * Get reply reference for threading
   */
  private async getReplyRef(parentUri: string): Promise<BlueskyReplyRef> {
    const response = await fetch(
      `${this.pdsUrl}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(parentUri)}&depth=0`,
      {
        headers: { Authorization: `Bearer ${this.session?.accessJwt}` },
      },
    );

    if (!response.ok) {
      throw new SocialError(
        'Failed to get parent post',
        'NOT_FOUND',
        'bluesky',
      );
    }

    const data = await response.json();
    const parent = data.thread.post;

    // Get root from parent's reply or use parent as root
    const root = parent.record.reply?.root ?? {
      uri: parent.uri,
      cid: parent.cid,
    };

    return {
      root,
      parent: {
        uri: parent.uri,
        cid: parent.cid,
      },
    };
  }

  /**
   * Build post text with hashtags
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

    // Truncate to 300 chars
    if (result.length > 300) {
      result = `${result.substring(0, 297)}...`;
    }

    return result;
  }

  /**
   * Handle API errors
   */
  private async handleError(response: Response): Promise<never> {
    const text = await response.text();
    let error: BlueskyApiError;
    try {
      error = JSON.parse(text) as BlueskyApiError;
    } catch {
      error = { message: text };
    }

    if (response.status === 401) {
      throw new SocialAuthError('bluesky', error.message ?? 'Unauthorized');
    }

    if (response.status === 429) {
      throw new SocialRateLimitError('bluesky');
    }

    throw new SocialError(
      error.message ?? 'API request failed',
      error.error ?? 'API_ERROR',
      'bluesky',
      response.status,
    );
  }
}
