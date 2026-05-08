/**
 * YouTube Adapter
 *
 * Implements SocialPlatform interface for YouTube/YouTube Shorts publishing.
 * Uses YouTube Data API v3.
 */

import { createHash } from 'node:crypto';

import { createLogger, type Logger } from '@happyvertical/logger';
import {
  createSafetyResult,
  isPublicPublishMode,
  resolvePublishMode,
} from '../safety.js';
import type {
  AuthorizationOptions,
  AuthorizationResult,
  AuthResult,
  CodeExchangeParams,
  ImagePost,
  LinkPost,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostResult,
  SocialPlatform,
  TextPost,
  VideoPost,
  YouTubeConfig,
} from '../types.js';
import {
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
} from '../types.js';

const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3';

/**
 * YouTube video category IDs
 * @see https://developers.google.com/youtube/v3/docs/videoCategories/list
 */
export const YOUTUBE_CATEGORIES = {
  FILM_ANIMATION: '1',
  AUTOS_VEHICLES: '2',
  MUSIC: '10',
  PETS_ANIMALS: '15',
  SPORTS: '17',
  TRAVEL_EVENTS: '19',
  GAMING: '20',
  PEOPLE_BLOGS: '22',
  COMEDY: '23',
  ENTERTAINMENT: '24',
  NEWS_POLITICS: '25',
  HOWTO_STYLE: '26',
  EDUCATION: '27',
  SCIENCE_TECH: '28',
  NONPROFITS_ACTIVISM: '29',
} as const;

/**
 * Default category for video uploads
 */
const DEFAULT_CATEGORY_ID = YOUTUBE_CATEGORIES.NEWS_POLITICS;

/**
 * Default scopes for YouTube API
 */
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

interface YouTubeApiError {
  error?: {
    code?: number | string;
    message?: string;
  };
}

/**
 * YouTube adapter for video publishing
 *
 * @example
 * ```typescript
 * const youtube = new YouTubeAdapter({
 *   type: 'youtube',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   accessToken: 'user-access-token',
 *   refreshToken: 'user-refresh-token',
 * });
 *
 * const result = await youtube.publishVideo({
 *   file: videoBuffer,
 *   title: 'Breaking News',
 *   description: 'Latest updates...',
 *   tags: ['news', 'local'],
 *   isShort: true,
 * });
 * ```
 */
export class YouTubeAdapter implements SocialPlatform {
  readonly platform = 'youtube' as const;
  private config: YouTubeConfig;
  private logger: Logger;
  private currentAccessToken?: string;

  constructor(config: YouTubeConfig) {
    this.config = config;
    this.currentAccessToken = config.accessToken;
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(options: AuthorizationOptions = {}): AuthorizationResult {
    const state = options.state ?? crypto.randomUUID();
    const scopes = options.scopes ?? DEFAULT_SCOPES;

    // Generate PKCE code verifier and challenge
    const codeVerifier = options.codeVerifier ?? this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: options.redirectUri ?? this.config.redirectUri ?? '',
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    return {
      url: `${YOUTUBE_AUTH_URL}?${params}`,
      state,
      codeVerifier,
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(params: CodeExchangeParams): Promise<AuthResult> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri ?? this.config.redirectUri ?? '',
    });

    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const response = await fetch(YOUTUBE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new SocialAuthError('youtube', `Token exchange failed: ${error}`);
    }

    const data = await response.json();

    this.currentAccessToken = data.access_token;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      tokenType: data.token_type,
      scopes: data.scope?.split(' '),
    };
  }

  async authenticate(): Promise<AuthResult> {
    if (!this.config.accessToken) {
      throw new SocialAuthError('youtube', 'No access token configured');
    }

    // Verify token is valid
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${this.config.accessToken}`,
    );

    if (!response.ok) {
      // Try to refresh if we have a refresh token
      if (this.config.refreshToken) {
        return this.refreshToken(this.config.refreshToken);
      }
      throw new SocialAuthError('youtube', 'Invalid access token');
    }

    const data = await response.json();

    return {
      accessToken: this.config.accessToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: data.scope?.split(' '),
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(YOUTUBE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new SocialAuthError('youtube', `Token refresh failed: ${error}`);
    }

    const data = await response.json();

    this.currentAccessToken = data.access_token;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      tokenType: data.token_type,
    };
  }

  async publishVideo(video: VideoPost): Promise<PostResult> {
    const publishMode = resolvePublishMode(this.config);
    const safeVisibility = isPublicPublishMode(publishMode)
      ? (video.visibility ?? 'public')
      : 'private';

    if (publishMode === 'dry_run') {
      return createSafetyResult({
        platform: this.platform,
        mode: publishMode,
        postType: 'video',
        payload: {
          title: video.title ?? 'Untitled',
          description: this.buildDescription(video),
          tags: video.tags,
          categoryId: video.categoryId ?? DEFAULT_CATEGORY_ID,
          privacyStatus: safeVisibility,
          isShort: video.isShort ?? false,
          scheduledAt: video.scheduledAt?.toISOString(),
        },
        note: 'YouTube dry run: no video was uploaded.',
      });
    }

    const accessToken = this.currentAccessToken ?? this.config.accessToken;
    if (!accessToken) {
      throw new SocialAuthError('youtube', 'No access token');
    }

    // Prepare video metadata
    const metadata = {
      snippet: {
        title: video.title ?? 'Untitled',
        description: this.buildDescription(video),
        tags: video.tags,
        categoryId: video.categoryId ?? DEFAULT_CATEGORY_ID,
      },
      status: {
        privacyStatus: safeVisibility,
        selfDeclaredMadeForKids: false,
        ...(video.scheduledAt && {
          publishAt: video.scheduledAt.toISOString(),
          privacyStatus: 'private', // Must be private for scheduling
        }),
      },
    };

    // Get video data
    const videoData = Buffer.isBuffer(video.file)
      ? video.file
      : await fetch(video.file)
          .then((r) => r.arrayBuffer())
          .then(Buffer.from);

    // Initialize resumable upload
    const initResponse = await fetch(
      `${YOUTUBE_UPLOAD_URL}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': videoData.length.toString(),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initResponse.ok) {
      await this.handleError(initResponse);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new SocialError(
        'Failed to get upload URL',
        'UPLOAD_INIT_FAILED',
        'youtube',
      );
    }

    // Upload video data
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': videoData.length.toString(),
      },
      body: new Uint8Array(videoData),
    });

    if (!uploadResponse.ok) {
      await this.handleError(uploadResponse);
    }

    const result = await uploadResponse.json();

    // Upload thumbnail if provided
    if (video.thumbnail) {
      await this.uploadThumbnail(result.id, video.thumbnail, accessToken);
    }

    const status: PostResult['status'] = video.scheduledAt
      ? 'scheduled'
      : isPublicPublishMode(publishMode)
        ? 'processing'
        : 'staged';

    return {
      id: result.id,
      url: `https://youtube.com/watch?v=${result.id}`,
      status,
      publishedAt: status === 'processing' ? new Date() : undefined,
      scheduledAt: video.scheduledAt,
      metadata: {
        channelId: result.snippet?.channelId,
        channelTitle: result.snippet?.channelTitle,
        publishMode,
        privacyStatus: metadata.status.privacyStatus,
        safety: !isPublicPublishMode(publishMode),
      },
    };
  }

  /**
   * Upload custom thumbnail
   * @returns true if upload succeeded, false otherwise
   */
  private async uploadThumbnail(
    videoId: string,
    thumbnail: Buffer | string,
    accessToken: string,
  ): Promise<boolean> {
    try {
      const thumbnailData = Buffer.isBuffer(thumbnail)
        ? thumbnail
        : await fetch(thumbnail)
            .then((r) => r.arrayBuffer())
            .then(Buffer.from);

      const response = await fetch(
        `${YOUTUBE_UPLOAD_URL}/thumbnails/set?videoId=${videoId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'image/png',
          },
          body: new Uint8Array(thumbnailData),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn('Failed to upload thumbnail', {
          videoId,
          status: response.status,
          error: errorText,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn('Thumbnail upload error', {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async publishImage(_image: ImagePost): Promise<PostResult> {
    throw new SocialError(
      'YouTube does not support image-only posts',
      'NOT_SUPPORTED',
      'youtube',
    );
  }

  async publishText(_text: TextPost): Promise<PostResult> {
    throw new SocialError(
      'YouTube does not support text-only posts',
      'NOT_SUPPORTED',
      'youtube',
    );
  }

  async publishLink(_link: LinkPost): Promise<PostResult> {
    throw new SocialError(
      'YouTube does not support link-only posts',
      'NOT_SUPPORTED',
      'youtube',
    );
  }

  async getPost(postId: string): Promise<Post> {
    const accessToken = this.currentAccessToken ?? this.config.accessToken;
    if (!accessToken) {
      throw new SocialAuthError('youtube', 'No access token');
    }

    const response = await fetch(
      `${YOUTUBE_API_URL}/videos?id=${postId}&part=snippet,status,statistics`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      throw new SocialError('Video not found', 'NOT_FOUND', 'youtube', 404);
    }

    return {
      id: video.id,
      url: `https://youtube.com/watch?v=${video.id}`,
      type: 'video',
      title: video.snippet.title,
      description: video.snippet.description,
      publishedAt: new Date(video.snippet.publishedAt),
      visibility: video.status.privacyStatus,
      analytics: {
        views: this.parseMetric(video.statistics.viewCount),
        likes: this.parseMetric(video.statistics.likeCount),
        comments: this.parseMetric(video.statistics.commentCount),
        lastUpdated: new Date(),
        raw: video.statistics,
      },
    };
  }

  async deletePost(postId: string): Promise<void> {
    const accessToken = this.currentAccessToken ?? this.config.accessToken;
    if (!accessToken) {
      throw new SocialAuthError('youtube', 'No access token');
    }

    const response = await fetch(`${YOUTUBE_API_URL}/videos?id=${postId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 204) {
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
      image: false,
      text: false,
      link: false,
      scheduling: true,
      analytics: true,
      rawAnalytics: true,
      publishModes: ['dry_run', 'private_or_scheduled', 'public'],
      staging: false,
      privatePublishing: true,
      maxVideoLength: 60 * 60 * 12, // 12 hours (with verification)
      maxVideoSize: 256 * 1024 * 1024 * 1024, // 256GB
      supportedVideoFormats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3'],
      maxTextLength: 5000, // Description
      maxHashtags: 15,
      supportedPostTypes: ['video'],
    };
  }

  /**
   * Build description with link and hashtags
   */
  private buildDescription(video: VideoPost): string {
    let description = video.description ?? '';

    if (video.linkUrl) {
      description += `\n\n${video.linkUrl}`;
    }

    const tags = video.isShort
      ? Array.from(new Set([...(video.tags ?? []), 'Shorts']))
      : video.tags;

    if (tags && tags.length > 0) {
      const hashtags = tags.map((t) => (t.startsWith('#') ? t : `#${t}`));
      description += `\n\n${hashtags.join(' ')}`;
    }

    return description;
  }

  private parseMetric(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /**
   * Handle API errors
   */
  private async handleError(response: Response): Promise<never> {
    const text = await response.text();
    let error: YouTubeApiError;
    try {
      error = JSON.parse(text) as YouTubeApiError;
    } catch {
      error = { error: { message: text } };
    }

    if (response.status === 401) {
      throw new SocialAuthError(
        'youtube',
        error.error?.message ?? 'Unauthorized',
      );
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new SocialRateLimitError(
        'youtube',
        retryAfter ? parseInt(retryAfter, 10) : undefined,
      );
    }

    throw new SocialError(
      error.error?.message ?? 'API request failed',
      error.error?.code?.toString() ?? 'API_ERROR',
      'youtube',
      response.status,
    );
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate PKCE code challenge from verifier using S256
   */
  private generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return Buffer.from(hash)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
