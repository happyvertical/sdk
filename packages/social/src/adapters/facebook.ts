/**
 * Facebook Pages Adapter
 *
 * Implements SocialPlatform interface for Facebook Page publishing.
 */

import {
  createSafetyResult,
  isPublicPublishMode,
  resolvePublishMode,
} from '../safety.js';
import type {
  AuthResult,
  FacebookPageConfig,
  ImagePost,
  LinkPost,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostResult,
  PublishMode,
  SocialPlatform,
  TextPost,
  VideoPost,
} from '../types.js';
import {
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
} from '../types.js';

interface FacebookInsight {
  name?: string;
  values?: Array<{ value?: unknown }>;
}

interface FacebookApiError {
  error?: {
    code?: number | string;
    message?: string;
  };
}

/**
 * Facebook Page adapter for publishing feed posts and Page videos.
 */
export class FacebookPageAdapter implements SocialPlatform {
  readonly platform = 'facebook' as const;
  private config: FacebookPageConfig;

  constructor(config: FacebookPageConfig) {
    this.config = config;
  }

  private get graphUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion ?? 'v24.0'}`;
  }

  async authenticate(): Promise<AuthResult> {
    const response = await fetch(
      `${this.graphUrl}/${this.config.pageId}?fields=id,name,link&access_token=${encodeURIComponent(this.config.accessToken)}`,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    return {
      accessToken: this.config.accessToken,
    };
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    throw new SocialError(
      'Facebook Page access tokens are refreshed through Meta OAuth',
      'NOT_IMPLEMENTED',
      'facebook',
    );
  }

  async publishText(text: TextPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'text',
        payload: {
          message: this.buildPostText(text.text, text.tags),
          link: text.linkUrl,
        },
      });
    }

    return this.createFeedPost(
      {
        message: this.buildPostText(text.text, text.tags),
        ...(text.linkUrl ? { link: text.linkUrl } : {}),
        ...this.safetyFeedFields(publishMode, text.scheduledAt),
      },
      publishMode,
    );
  }

  async publishLink(link: LinkPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const payload = {
      message: this.buildPostText(
        link.text ?? link.title ?? link.description ?? '',
        link.tags,
      ),
      link: link.url,
      ...this.safetyFeedFields(publishMode, link.scheduledAt),
    };

    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'link',
        payload,
      });
    }

    return this.createFeedPost(payload, publishMode);
  }

  async publishImage(image: ImagePost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'image',
        payload: {
          caption: this.buildPostText(
            image.description,
            image.tags,
            image.linkUrl,
          ),
          url: typeof image.file === 'string' ? image.file : undefined,
          link: image.linkUrl,
        },
      });
    }

    const form = new FormData();
    form.set('access_token', this.config.accessToken);
    form.set(
      'caption',
      this.buildPostText(image.description, image.tags, image.linkUrl),
    );
    for (const [key, value] of Object.entries(
      this.safetyFeedFields(publishMode, image.scheduledAt),
    )) {
      if (value !== undefined) form.set(key, value);
    }

    if (typeof image.file === 'string') {
      form.set('url', image.file);
    } else {
      form.set('source', new Blob([new Uint8Array(image.file)]));
    }

    const response = await fetch(
      `${this.graphUrl}/${this.config.pageId}/photos`,
      {
        method: 'POST',
        body: form,
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return this.toPostResult(
      data.post_id ?? data.id,
      this.safetyResultStatus(publishMode, image.scheduledAt),
      publishMode,
    );
  }

  async publishVideo(video: VideoPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'video',
        payload: {
          title: video.title,
          description: this.buildPostText(
            video.description,
            video.tags,
            video.linkUrl,
          ),
          fileUrl: typeof video.file === 'string' ? video.file : undefined,
          link: video.linkUrl,
          scheduledAt: video.scheduledAt?.toISOString(),
        },
      });
    }

    const form = new FormData();
    form.set('access_token', this.config.accessToken);
    form.set(
      'description',
      this.buildPostText(video.description, video.tags, video.linkUrl),
    );
    for (const [key, value] of Object.entries(
      this.safetyFeedFields(publishMode, video.scheduledAt),
    )) {
      if (value !== undefined) form.set(key, value);
    }
    if (video.title) {
      form.set('title', video.title);
    }
    if (video.linkUrl) {
      form.set('embeddable', 'true');
    }

    if (typeof video.file === 'string') {
      form.set('file_url', video.file);
    } else {
      form.set('source', new Blob([new Uint8Array(video.file)]));
    }

    const response = await fetch(
      `${this.graphUrl}/${this.config.pageId}/videos`,
      {
        method: 'POST',
        body: form,
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return this.toPostResult(
      data.id,
      this.safetyResultStatus(publishMode, video.scheduledAt, 'processing'),
      publishMode,
    );
  }

  async getPost(postId: string): Promise<Post> {
    const response = await fetch(
      `${this.graphUrl}/${postId}?fields=id,message,created_time,permalink_url,attachments{media_type},insights.metric(post_impressions,post_clicks,post_reactions_by_type_total,post_comments,post_shares)&access_token=${encodeURIComponent(this.config.accessToken)}`,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const mediaType = data.attachments?.data?.[0]?.media_type;

    return {
      id: data.id,
      url: data.permalink_url ?? `https://www.facebook.com/${data.id}`,
      type:
        mediaType === 'video'
          ? 'video'
          : mediaType === 'photo'
            ? 'image'
            : mediaType === 'share'
              ? 'link'
              : 'text',
      description: data.message,
      publishedAt: data.created_time ? new Date(data.created_time) : new Date(),
      visibility: 'public',
      analytics: this.parseInsights(data.insights?.data ?? []),
    };
  }

  async deletePost(postId: string): Promise<void> {
    const response = await fetch(
      `${this.graphUrl}/${postId}?access_token=${encodeURIComponent(this.config.accessToken)}`,
      { method: 'DELETE' },
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
      video: true,
      image: true,
      text: true,
      link: true,
      linkAttachment: true,
      scheduling: true,
      analytics: true,
      rawAnalytics: true,
      publishModes: [
        'dry_run',
        'stage_remote',
        'private_or_scheduled',
        'public',
      ],
      staging: true,
      privatePublishing: true,
      maxVideoLength: 240 * 60,
      maxVideoSize: 10 * 1024 * 1024 * 1024,
      supportedVideoFormats: ['mp4', 'mov'],
      aspectRatios: ['16:9', '1:1', '9:16', '4:5'],
      maxTextLength: 63206,
      maxHashtags: undefined,
      supportedPostTypes: ['text', 'image', 'video', 'link'],
    };
  }

  private async createFeedPost(
    fields: Record<string, string | undefined>,
    publishMode: PublishMode = 'public',
  ): Promise<PostResult> {
    const body = new URLSearchParams();
    body.set('access_token', this.config.accessToken);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== '') {
        body.set(key, value);
      }
    }

    const response = await fetch(
      `${this.graphUrl}/${this.config.pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const status =
      fields.published === 'false' && fields.scheduled_publish_time
        ? 'scheduled'
        : fields.published === 'false'
          ? 'staged'
          : 'published';
    return this.toPostResult(data.id, status, publishMode);
  }

  private toPostResult(
    id: string,
    status: PostResult['status'],
    publishMode: PublishMode = 'public',
  ): PostResult {
    return {
      id,
      url: `https://www.facebook.com/${id}`,
      status,
      publishedAt: status === 'published' ? new Date() : undefined,
      metadata: {
        publishMode,
        safety: publishMode !== 'public',
      },
    };
  }

  private safetyFeedFields(
    publishMode: ReturnType<typeof resolvePublishMode>,
    scheduledAt?: Date,
  ): Record<string, string | undefined> {
    if (isPublicPublishMode(publishMode)) {
      return {};
    }

    return {
      published: 'false',
      ...(scheduledAt
        ? {
            scheduled_publish_time: Math.floor(
              scheduledAt.getTime() / 1000,
            ).toString(),
          }
        : {}),
    };
  }

  private safetyResultStatus(
    publishMode: ReturnType<typeof resolvePublishMode>,
    scheduledAt?: Date,
    publicStatus: PostResult['status'] = 'published',
  ): PostResult['status'] {
    if (isPublicPublishMode(publishMode)) return publicStatus;
    return scheduledAt ? 'scheduled' : 'staged';
  }

  private buildPostText(
    text?: string,
    tags?: string[],
    linkUrl?: string,
  ): string {
    let result = text ?? '';

    if (linkUrl && !result.includes(linkUrl)) {
      result += result.length > 0 ? `\n\n${linkUrl}` : linkUrl;
    }

    if (tags && tags.length > 0) {
      const hashtags = tags.map((tag) =>
        tag.startsWith('#') ? tag : `#${tag}`,
      );
      result +=
        result.length > 0 ? `\n\n${hashtags.join(' ')}` : hashtags.join(' ');
    }

    return result;
  }

  private parseInsights(insights: FacebookInsight[]): PostAnalytics {
    const analytics: PostAnalytics = { lastUpdated: new Date(), raw: insights };

    for (const insight of insights) {
      const value = insight.values?.[0]?.value;
      switch (insight.name) {
        case 'post_impressions':
          analytics.views = typeof value === 'number' ? value : undefined;
          analytics.impressions = analytics.views;
          break;
        case 'post_clicks':
          analytics.clicks = typeof value === 'number' ? value : undefined;
          break;
        case 'post_comments':
          analytics.comments = typeof value === 'number' ? value : undefined;
          break;
        case 'post_shares':
          analytics.shares = typeof value === 'number' ? value : undefined;
          break;
        case 'post_reactions_by_type_total':
          analytics.likes =
            typeof value === 'object' && value !== null
              ? Object.values(value).reduce<number>(
                  (sum, count) => sum + (typeof count === 'number' ? count : 0),
                  0,
                )
              : undefined;
          break;
      }
    }

    return analytics;
  }

  private async handleError(response: Response): Promise<never> {
    const text = await response.text();
    let error: FacebookApiError;
    try {
      error = JSON.parse(text) as FacebookApiError;
    } catch {
      error = { error: { message: text } };
    }

    if (response.status === 401 || error.error?.code === 190) {
      throw new SocialAuthError(
        'facebook',
        error.error?.message ?? 'Unauthorized',
      );
    }

    if (response.status === 429 || error.error?.code === 4) {
      throw new SocialRateLimitError('facebook');
    }

    throw new SocialError(
      error.error?.message ?? 'API request failed',
      error.error?.code?.toString() ?? 'API_ERROR',
      'facebook',
      response.status,
    );
  }
}
