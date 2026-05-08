/**
 * X (Twitter) Adapter
 *
 * Implements SocialPlatform interface for X (formerly Twitter) publishing.
 * Uses Twitter API v2.
 */

import { createHmac } from 'node:crypto';

import { createLogger } from '@happyvertical/logger';
import {
  createSafetyResult,
  isPublicPublishMode,
  resolvePublishMode,
} from '../safety.js';
import type {
  AuthResult,
  ImagePost,
  LinkBehavior,
  LinkPost,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostResult,
  SocialPlatform,
  TextPost,
  VideoPost,
  XConfig,
} from '../types.js';
import {
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
} from '../types.js';

const X_API_URL = 'https://api.twitter.com/2';
const X_UPLOAD_URL = 'https://upload.twitter.com/1.1';
const X_API_MEDIA_UPLOAD_URL = 'https://api.x.com/2/media/upload';
const X_OAUTH_TOKEN_URL = 'https://api.x.com/2/oauth2/token';

/**
 * X (Twitter) adapter for publishing
 *
 * @example
 * ```typescript
 * const x = new XAdapter({
 *   type: 'x',
 *   apiKey: 'consumer-key',
 *   apiSecret: 'consumer-secret',
 *   accessToken: 'user-access-token',
 *   accessSecret: 'user-access-secret',
 * });
 *
 * await x.authenticate();
 *
 * const result = await x.publishText({
 *   text: 'Breaking news from Bentley!',
 *   linkUrl: 'https://example.com/article',
 * });
 * ```
 */
export class XAdapter implements SocialPlatform {
  readonly platform = 'x' as const;
  private config: XConfig;
  private logger: ReturnType<typeof createLogger>;

  constructor(config: XConfig) {
    this.config = config;
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Generate OAuth 1.0a signature for request
   */
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
  ): string {
    const { apiKey, apiSecret, accessSecret } = this.requireOAuth1Config();
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: apiKey,
      oauth_nonce: this.generateNonce(),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.config.accessToken,
      oauth_version: '1.0',
      ...params,
    };

    // Sort and encode parameters
    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(
        (k) => `${this.percentEncode(k)}=${this.percentEncode(oauthParams[k])}`,
      )
      .join('&');

    // Create signature base string
    const signatureBase = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(sortedParams),
    ].join('&');

    // Create signing key
    const signingKey = `${this.percentEncode(apiSecret)}&${this.percentEncode(accessSecret)}`;

    // Generate HMAC-SHA1 signature
    const signature = this.hmacSha1(signatureBase, signingKey);

    // Build Authorization header
    const authParams: Record<string, string> = {
      ...oauthParams,
      oauth_signature: signature,
    };

    return (
      'OAuth ' +
      Object.keys(authParams)
        .filter((k) => k.startsWith('oauth_'))
        .sort()
        .map(
          (k) =>
            `${this.percentEncode(k)}="${this.percentEncode(authParams[k])}"`,
        )
        .join(', ')
    );
  }

  private generateNonce(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  private percentEncode(str: string): string {
    return encodeURIComponent(str).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private hmacSha1(data: string, key: string): string {
    return createHmac('sha1', key).update(data).digest('base64');
  }

  async authenticate(): Promise<AuthResult> {
    // Verify credentials by getting current user
    const response = await this.makeRequest(
      'GET',
      `${X_API_URL}/users/me?user.fields=username,name`,
    );

    if (!response.ok) {
      throw new SocialAuthError('x', 'Invalid credentials');
    }

    return {
      accessToken: this.config.accessToken,
      refreshToken: this.config.refreshToken,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    if (!this.usesOAuth2()) {
      throw new SocialError(
        'OAuth 1.0a does not support token refresh',
        'NOT_SUPPORTED',
        'x',
      );
    }
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new SocialAuthError('x', 'Missing OAuth 2.0 client credentials');
    }

    const response = await fetch(X_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuthHeader(
          this.config.clientId,
          this.config.clientSecret,
        ),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const token = await response.json();
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt:
        typeof token.expires_in === 'number'
          ? new Date(Date.now() + token.expires_in * 1000)
          : undefined,
      tokenType: token.token_type,
      scopes:
        typeof token.scope === 'string' ? token.scope.split(' ') : undefined,
    };
  }

  private basicAuthHeader(clientId: string, clientSecret: string): string {
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    )}`;
  }

  async publishVideo(video: VideoPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const linkBehavior = this.resolveLinkBehavior(video.linkBehavior);
    const text = this.buildPostText(
      video.description,
      video.tags,
      video.linkUrl,
      linkBehavior,
    );
    const payload = { text, linkBehavior, tags: video.tags };

    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'video',
        payload,
        note: 'X dry run: media was not uploaded and no post was created.',
      });
    }

    // Upload video first. This is safe for stage modes; media is not public
    // until attached to a post.
    const mediaId = await this.uploadMedia(video.file, 'video');

    if (!isPublicPublishMode(publishMode)) {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'video',
        payload: { ...payload, mediaId },
        remoteId: mediaId,
        staged: true,
        note: 'X media uploaded but no post was created.',
      });
    }

    const response = await this.makeRequest('POST', `${X_API_URL}/tweets`, {
      text,
      media: { media_ids: [mediaId] },
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();

    if (video.linkUrl && linkBehavior === 'reply') {
      await this.postLinkReply(data.data.id, video.linkUrl);
    }

    return {
      id: data.data.id,
      url: `https://x.com/i/status/${data.data.id}`,
      status: 'published',
      publishedAt: new Date(),
      metadata: { publishMode },
    };
  }

  async publishImage(image: ImagePost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const linkBehavior = this.resolveLinkBehavior(image.linkBehavior);
    const text = this.buildPostText(
      image.description,
      image.tags,
      image.linkUrl,
      linkBehavior,
    );
    const payload = {
      text,
      linkBehavior,
      tags: image.tags,
      altText: image.altText,
    };

    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'image',
        payload,
        note: 'X dry run: media was not uploaded and no post was created.',
      });
    }

    // Upload image first. This is safe for stage modes; media is not public
    // until attached to a post.
    const mediaId = await this.uploadMedia(image.file, 'image');

    if (!isPublicPublishMode(publishMode)) {
      if (image.altText) {
        await this.setMediaAltText(mediaId, image.altText);
      }
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'image',
        payload: { ...payload, mediaId },
        remoteId: mediaId,
        staged: true,
        note: 'X media uploaded but no post was created.',
      });
    }

    const body: Record<string, unknown> = {
      text,
      media: { media_ids: [mediaId] },
    };

    // Add alt text if provided
    if (image.altText) {
      // Alt text is set during upload via metadata endpoint
      await this.setMediaAltText(mediaId, image.altText);
    }

    const response = await this.makeRequest(
      'POST',
      `${X_API_URL}/tweets`,
      body,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();

    if (image.linkUrl && linkBehavior === 'reply') {
      await this.postLinkReply(data.data.id, image.linkUrl);
    }

    return {
      id: data.data.id,
      url: `https://x.com/i/status/${data.data.id}`,
      status: 'published',
      publishedAt: new Date(),
      metadata: { publishMode },
    };
  }

  async publishText(text: TextPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const linkBehavior = this.resolveLinkBehavior(text.linkBehavior);
    const postText = this.buildPostText(
      text.text,
      text.tags,
      text.linkUrl,
      linkBehavior,
    );

    const body: Record<string, unknown> = { text: postText };

    // Handle reply
    if (text.replyTo) {
      body.reply = { in_reply_to_tweet_id: text.replyTo };
    }

    if (!isPublicPublishMode(publishMode)) {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'text',
        payload: body,
        note:
          publishMode === 'dry_run'
            ? 'X dry run: no post was created.'
            : 'X has no non-public text staging endpoint; no post was created.',
      });
    }

    const response = await this.makeRequest(
      'POST',
      `${X_API_URL}/tweets`,
      body,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();

    if (text.linkUrl && linkBehavior === 'reply' && !text.replyTo) {
      await this.postLinkReply(data.data.id, text.linkUrl);
    }

    return {
      id: data.data.id,
      url: `https://x.com/i/status/${data.data.id}`,
      status: 'published',
      publishedAt: new Date(),
      metadata: { publishMode },
    };
  }

  async publishLink(link: LinkPost): Promise<PostResult> {
    return this.publishText({
      text: link.text ?? link.title ?? link.description ?? link.url,
      tags: link.tags,
      linkUrl: link.url,
      scheduledAt: link.scheduledAt,
      linkBehavior: link.linkBehavior,
    });
  }

  /**
   * Upload media to Twitter
   */
  private async uploadMedia(
    file: Buffer | string,
    type: 'image' | 'video',
  ): Promise<string> {
    if (this.usesOAuth2()) {
      return this.uploadMediaV2(file, type);
    }

    return this.uploadMediaOAuth1(file, type);
  }

  private async readMediaData(file: Buffer | string): Promise<Buffer> {
    return Buffer.isBuffer(file)
      ? file
      : await fetch(file)
          .then((r) => r.arrayBuffer())
          .then(Buffer.from);
  }

  /**
   * Upload media using X API v2 and OAuth 2.0 user context.
   */
  private async uploadMediaV2(
    file: Buffer | string,
    type: 'image' | 'video',
  ): Promise<string> {
    const mediaData = await this.readMediaData(file);
    const mediaType = type === 'video' ? 'video/mp4' : 'image/png';
    const mediaCategory = type === 'video' ? 'tweet_video' : 'tweet_image';

    const initResponse = await this.makeBearerUploadRequest('POST', {
      command: 'INIT',
      total_bytes: String(mediaData.length),
      media_type: mediaType,
      media_category: mediaCategory,
    });

    if (!initResponse.ok) {
      throw new SocialError('Media upload init failed', 'UPLOAD_FAILED', 'x');
    }

    const initData = await initResponse.json();
    const mediaId = initData.data?.id;
    if (!mediaId) {
      throw new SocialError(
        'Media upload init did not return a media id',
        'UPLOAD_FAILED',
        'x',
      );
    }

    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;

    for (let offset = 0; offset < mediaData.length; offset += chunkSize) {
      const chunk = mediaData.subarray(offset, offset + chunkSize);
      const formData = new FormData();
      formData.append('command', 'APPEND');
      formData.append('media_id', mediaId);
      formData.append('segment_index', segmentIndex.toString());
      formData.append('media', new Blob([new Uint8Array(chunk)]));

      const appendResponse = await this.makeBearerUploadRequest(
        'POST',
        formData,
      );

      if (!appendResponse.ok) {
        throw new SocialError(
          'Media upload append failed',
          'UPLOAD_FAILED',
          'x',
        );
      }

      segmentIndex++;
    }

    const finalizeResponse = await this.makeBearerUploadRequest('POST', {
      command: 'FINALIZE',
      media_id: mediaId,
    });

    if (!finalizeResponse.ok) {
      throw new SocialError(
        'Media upload finalize failed',
        'UPLOAD_FAILED',
        'x',
      );
    }

    const finalizeData = await finalizeResponse.json();

    if (type === 'video' && finalizeData.data?.processing_info) {
      await this.waitForProcessing(mediaId);
    }

    return mediaId;
  }

  /**
   * Upload media using legacy OAuth 1.0a upload endpoints.
   */
  private async uploadMediaOAuth1(
    file: Buffer | string,
    type: 'image' | 'video',
  ): Promise<string> {
    const mediaData = await this.readMediaData(file);

    const mediaType = type === 'video' ? 'video/mp4' : 'image/png';
    const mediaCategory = type === 'video' ? 'tweet_video' : 'tweet_image';

    // INIT
    const initResponse = await this.makeUploadRequest(
      'POST',
      `${X_UPLOAD_URL}/media/upload.json`,
      {
        command: 'INIT',
        total_bytes: mediaData.length,
        media_type: mediaType,
        media_category: mediaCategory,
      },
    );

    if (!initResponse.ok) {
      throw new SocialError('Media upload init failed', 'UPLOAD_FAILED', 'x');
    }

    const initData = await initResponse.json();
    const mediaId = initData.media_id_string;

    // APPEND (chunked upload)
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    let segmentIndex = 0;

    for (let offset = 0; offset < mediaData.length; offset += chunkSize) {
      const chunk = mediaData.subarray(offset, offset + chunkSize);

      const formData = new FormData();
      formData.append('command', 'APPEND');
      formData.append('media_id', mediaId);
      formData.append('segment_index', segmentIndex.toString());
      formData.append('media', new Blob([new Uint8Array(chunk)]));

      const appendResponse = await this.makeUploadRequest(
        'POST',
        `${X_UPLOAD_URL}/media/upload.json`,
        formData,
        true,
      );

      if (!appendResponse.ok) {
        throw new SocialError(
          'Media upload append failed',
          'UPLOAD_FAILED',
          'x',
        );
      }

      segmentIndex++;
    }

    // FINALIZE
    const finalizeResponse = await this.makeUploadRequest(
      'POST',
      `${X_UPLOAD_URL}/media/upload.json`,
      {
        command: 'FINALIZE',
        media_id: mediaId,
      },
    );

    if (!finalizeResponse.ok) {
      throw new SocialError(
        'Media upload finalize failed',
        'UPLOAD_FAILED',
        'x',
      );
    }

    const finalizeData = await finalizeResponse.json();

    // Wait for processing if video
    if (type === 'video' && finalizeData.processing_info) {
      await this.waitForProcessing(mediaId);
    }

    return mediaId;
  }

  /**
   * Wait for media processing to complete
   */
  private async waitForProcessing(mediaId: string): Promise<void> {
    let checkCount = 0;
    const maxChecks = 60; // 5 minutes max

    while (checkCount < maxChecks) {
      const statusResponse = this.usesOAuth2()
        ? await this.makeBearerUploadRequest('GET', {
            command: 'STATUS',
            media_id: mediaId,
          })
        : await this.makeUploadRequest(
            'GET',
            `${X_UPLOAD_URL}/media/upload.json`,
            {
              command: 'STATUS',
              media_id: mediaId,
            },
          );

      const statusData = await statusResponse.json();
      const processingInfo =
        statusData.processing_info ?? statusData.data?.processing_info;

      if (!processingInfo || processingInfo.state === 'succeeded') {
        return;
      }

      if (processingInfo.state === 'failed') {
        throw new SocialError(
          processingInfo.error?.message ?? 'Media processing failed',
          'PROCESSING_FAILED',
          'x',
        );
      }

      // Wait before next check
      const waitTime = (processingInfo.check_after_secs ?? 5) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      checkCount++;
    }

    throw new SocialError(
      'Media processing timeout',
      'PROCESSING_TIMEOUT',
      'x',
    );
  }

  /**
   * Set alt text for uploaded media
   * Uses JSON body as required by metadata/create endpoint
   */
  private async setMediaAltText(
    mediaId: string,
    altText: string,
  ): Promise<void> {
    if (this.usesOAuth2()) {
      this.logger.warn('X OAuth 2.0 alt text metadata is not implemented yet');
      return;
    }

    const url = `${X_UPLOAD_URL}/media/metadata/create.json`;
    const authHeader = this.generateOAuthSignature('POST', url, {});

    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_id: mediaId,
        alt_text: { text: altText },
      }),
    });
  }

  /**
   * Post link as reply (algorithm-friendly pattern)
   */
  private async postLinkReply(
    parentId: string,
    linkUrl: string,
  ): Promise<void> {
    await this.makeRequest('POST', `${X_API_URL}/tweets`, {
      text: linkUrl,
      reply: { in_reply_to_tweet_id: parentId },
    });
  }

  async getPost(postId: string): Promise<Post> {
    const response = await this.makeRequest(
      'GET',
      `${X_API_URL}/tweets/${postId}?tweet.fields=created_at,public_metrics,attachments`,
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const tweet = data.data;

    return {
      id: tweet.id,
      url: `https://x.com/i/status/${tweet.id}`,
      type: tweet.attachments?.media_keys ? 'image' : 'text',
      description: tweet.text,
      publishedAt: new Date(tweet.created_at),
      visibility: 'public',
      analytics: {
        likes: tweet.public_metrics?.like_count,
        shares: tweet.public_metrics?.retweet_count,
        comments: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count,
        impressions: tweet.public_metrics?.impression_count,
        lastUpdated: new Date(),
        raw: tweet.public_metrics,
      },
    };
  }

  async deletePost(postId: string): Promise<void> {
    const response = await this.makeRequest(
      'DELETE',
      `${X_API_URL}/tweets/${postId}`,
    );

    if (!response.ok && response.status !== 200) {
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
      linkAttachment: false,
      scheduling: false, // Would need Twitter Ads API
      analytics: true,
      rawAnalytics: true,
      publishModes: ['dry_run', 'stage_remote', 'public'],
      staging: true,
      privatePublishing: false,
      maxVideoLength: 140, // 2 minutes 20 seconds
      maxVideoSize: 512 * 1024 * 1024, // 512MB
      supportedVideoFormats: ['mp4', 'mov'],
      aspectRatios: ['16:9', '1:1', '9:16'],
      maxTextLength: 280,
      maxHashtags: undefined, // No hard limit
      supportedPostTypes: ['text', 'image', 'video', 'link'],
    };
  }

  private resolveLinkBehavior(override?: LinkBehavior): LinkBehavior {
    return override ?? this.config.linkBehavior ?? 'inline';
  }

  private usesOAuth2(): boolean {
    if (this.config.authType) {
      return this.config.authType === 'oauth2';
    }

    return !this.config.accessSecret;
  }

  private requireOAuth1Config(): {
    apiKey: string;
    apiSecret: string;
    accessSecret: string;
  } {
    if (
      !this.config.apiKey ||
      !this.config.apiSecret ||
      !this.config.accessSecret
    ) {
      throw new SocialAuthError('x', 'Missing OAuth 1.0a credentials');
    }

    return {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
      accessSecret: this.config.accessSecret,
    };
  }

  /**
   * Build post text with hashtags
   */
  private buildPostText(
    text?: string,
    tags?: string[],
    linkUrl?: string,
    linkBehavior: LinkBehavior = 'inline',
  ): string {
    let result = text ?? '';

    if (linkUrl && linkBehavior === 'inline' && !result.includes(linkUrl)) {
      result += result.length > 0 ? `\n\n${linkUrl}` : linkUrl;
    }

    if (tags && tags.length > 0) {
      const hashtags = tags.map((t) => (t.startsWith('#') ? t : `#${t}`));
      result += `\n\n${hashtags.join(' ')}`;
    }

    // Truncate to 280 chars
    if (result.length > 280) {
      result = `${result.substring(0, 277)}...`;
    }

    return result;
  }

  /**
   * Make authenticated request to Twitter API v2
   */
  private async makeRequest(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    const parsedUrl = new URL(url);
    const signatureParams = Object.fromEntries(parsedUrl.searchParams);
    const signingUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const authHeader = this.usesOAuth2()
      ? `Bearer ${this.config.accessToken}`
      : this.generateOAuthSignature(method, signingUrl, signatureParams);

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  private async makeBearerUploadRequest(
    method: string,
    params: FormData | Record<string, string>,
  ): Promise<Response> {
    let url = X_API_MEDIA_UPLOAD_URL;
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
      },
    };

    if (method === 'GET' && !(params instanceof FormData)) {
      url = `${url}?${new URLSearchParams(params).toString()}`;
    } else if (params instanceof FormData) {
      options.body = params;
    } else {
      const formData = new FormData();
      for (const [key, value] of Object.entries(params)) {
        formData.append(key, value);
      }
      options.body = formData;
    }

    return fetch(url, options);
  }

  /**
   * Make authenticated request to Twitter Upload API
   */
  private async makeUploadRequest(
    method: string,
    url: string,
    params: FormData | Record<string, unknown>,
    isFormData = false,
  ): Promise<Response> {
    // For OAuth signature, we need string params (not FormData)
    // Convert Record values to strings for OAuth and URLSearchParams
    const stringParams: Record<string, string> =
      params instanceof FormData
        ? {}
        : Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          );
    const queryParams =
      method === 'GET' || (!isFormData && !(params instanceof FormData))
        ? stringParams
        : {};
    const authHeader = this.generateOAuthSignature(method, url, queryParams);

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authHeader,
      },
    };

    if (method === 'GET') {
      const queryString = new URLSearchParams(stringParams).toString();
      url = `${url}?${queryString}`;
    } else if (isFormData && params instanceof FormData) {
      options.body = params;
    } else if (!(params instanceof FormData)) {
      options.headers = {
        ...options.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      options.body = new URLSearchParams(stringParams).toString();
    }

    return fetch(url, options);
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
      error = { detail: text };
    }

    if (response.status === 401) {
      throw new SocialAuthError('x', error.detail ?? 'Unauthorized');
    }

    if (response.status === 429) {
      const resetTime = response.headers.get('x-rate-limit-reset');
      const retryAfter = resetTime
        ? parseInt(resetTime, 10) - Math.floor(Date.now() / 1000)
        : undefined;
      throw new SocialRateLimitError('x', retryAfter);
    }

    throw new SocialError(
      error.detail ?? error.title ?? 'API request failed',
      error.type ?? 'API_ERROR',
      'x',
      response.status,
    );
  }
}
