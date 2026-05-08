/**
 * Social Platform Types
 *
 * Unified interface for publishing to social media platforms.
 */

/**
 * Supported social platforms
 */
export type SocialPlatformType =
  | 'youtube'
  | 'threads'
  | 'x'
  | 'bluesky'
  | 'facebook';

/**
 * How adapters should attach links to posts.
 */
export type LinkBehavior = 'inline' | 'attachment' | 'reply' | 'none';

/**
 * Safety mode for publish operations.
 * - dry_run: Build and validate payloads without platform API writes
 * - stage_remote: Use non-public staging endpoints where available
 * - private_or_scheduled: Create a non-public/private/scheduled platform object where available
 * - public: Publish publicly
 */
export type PublishMode =
  | 'dry_run'
  | 'stage_remote'
  | 'private_or_scheduled'
  | 'public';

/**
 * Base configuration for social platform adapters
 */
export interface BaseSocialConfig {
  /**
   * Platform type
   */
  type: SocialPlatformType;

  /**
   * Rate limiting configuration (applies at SDK level)
   */
  rateLimit?: {
    /**
     * Maximum requests per minute
     */
    requestsPerMinute?: number;

    /**
     * Maximum concurrent requests
     */
    maxConcurrent?: number;
  };

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Controls whether publish calls create public content.
   * Defaults to public for backward compatibility.
   */
  publishMode?: PublishMode;
}

/**
 * YouTube configuration
 */
export interface YouTubeConfig extends BaseSocialConfig {
  type: 'youtube';

  /**
   * OAuth2 client ID
   */
  clientId: string;

  /**
   * OAuth2 client secret
   */
  clientSecret: string;

  /**
   * Access token (from OAuth flow)
   */
  accessToken?: string;

  /**
   * Refresh token (from OAuth flow)
   */
  refreshToken?: string;

  /**
   * Redirect URI for OAuth
   */
  redirectUri?: string;
}

/**
 * Threads (Meta) configuration
 */
export interface ThreadsConfig extends BaseSocialConfig {
  type: 'threads';

  /**
   * Access token from Meta OAuth
   */
  accessToken: string;

  /**
   * Instagram/Threads user ID
   */
  userId: string;
}

/**
 * Facebook Page configuration
 */
export interface FacebookPageConfig extends BaseSocialConfig {
  type: 'facebook';

  /**
   * Page access token with pages_manage_posts permission
   */
  accessToken: string;

  /**
   * Facebook Page ID
   */
  pageId: string;

  /**
   * Optional Graph API version.
   * @default v24.0
   */
  apiVersion?: string;
}

/**
 * X (Twitter) configuration
 */
export interface XConfig extends BaseSocialConfig {
  type: 'x';

  /**
   * Authentication mode. OAuth 2.0 is used when accessSecret is omitted.
   *
   * @default 'oauth1' when accessSecret is present, otherwise 'oauth2'
   */
  authType?: 'oauth1' | 'oauth2';

  /**
   * API key (consumer key) for OAuth 1.0a.
   */
  apiKey?: string;

  /**
   * API secret (consumer secret) for OAuth 1.0a.
   */
  apiSecret?: string;

  /**
   * User access token.
   */
  accessToken: string;

  /**
   * User access token secret for OAuth 1.0a.
   */
  accessSecret?: string;

  /**
   * OAuth 2.0 client ID for refresh-token flows.
   */
  clientId?: string;

  /**
   * OAuth 2.0 client secret for confidential clients.
   */
  clientSecret?: string;

  /**
   * OAuth 2.0 refresh token.
   */
  refreshToken?: string;

  /**
   * Default handling for links.
   * @default 'inline'
   */
  linkBehavior?: LinkBehavior;
}

/**
 * Bluesky configuration
 */
export interface BlueskyConfig extends BaseSocialConfig {
  type: 'bluesky';

  /**
   * Handle or DID
   */
  identifier: string;

  /**
   * App password (not main password)
   */
  password: string;

  /**
   * PDS URL (optional, defaults to bsky.social)
   */
  pdsUrl?: string;
}

/**
 * Union of all platform configurations
 */
export type SocialConfig =
  | YouTubeConfig
  | ThreadsConfig
  | FacebookPageConfig
  | XConfig
  | BlueskyConfig;

/**
 * Authentication result
 */
export interface AuthResult {
  /**
   * Access token
   */
  accessToken: string;

  /**
   * Refresh token (if available)
   */
  refreshToken?: string;

  /**
   * Token expiration time
   */
  expiresAt?: Date;

  /**
   * Token type (usually 'Bearer')
   */
  tokenType?: string;

  /**
   * Granted scopes
   */
  scopes?: string[];
}

/**
 * Video post content
 */
export interface VideoPost {
  /**
   * Video file buffer or URL
   */
  file: Buffer | string;

  /**
   * Video title (YouTube, some platforms)
   */
  title?: string;

  /**
   * Post description/caption
   */
  description?: string;

  /**
   * Custom thumbnail image
   */
  thumbnail?: Buffer | string;

  /**
   * Hashtags to include
   */
  tags?: string[];

  /**
   * Link URL to include (e.g., article link)
   */
  linkUrl?: string;

  /**
   * Visibility setting
   * @default 'public'
   */
  visibility?: 'public' | 'unlisted' | 'private';

  /**
   * Scheduled publish time (if supported)
   */
  scheduledAt?: Date;

  /**
   * Category ID (YouTube)
   */
  categoryId?: string;

  /**
   * Whether this is a Short (YouTube)
   */
  isShort?: boolean;

  /**
   * Override the adapter/account default link behavior for this post.
   */
  linkBehavior?: LinkBehavior;
}

/**
 * Image post content
 */
export interface ImagePost {
  /**
   * Image file buffer or URL
   */
  file: Buffer | string;

  /**
   * Alt text for accessibility
   */
  altText?: string;

  /**
   * Post description/caption
   */
  description?: string;

  /**
   * Hashtags to include
   */
  tags?: string[];

  /**
   * Link URL to include
   */
  linkUrl?: string;

  /**
   * Scheduled publish time
   */
  scheduledAt?: Date;

  /**
   * Override the adapter/account default link behavior for this post.
   */
  linkBehavior?: LinkBehavior;
}

/**
 * Text post content
 */
export interface TextPost {
  /**
   * Post text content
   */
  text: string;

  /**
   * Hashtags to include
   */
  tags?: string[];

  /**
   * Link URL to include
   */
  linkUrl?: string;

  /**
   * Scheduled publish time
   */
  scheduledAt?: Date;

  /**
   * Reply to post ID (for threads/replies)
   */
  replyTo?: string;

  /**
   * Override the adapter/account default link behavior for this post.
   */
  linkBehavior?: LinkBehavior;
}

/**
 * Link post content
 */
export interface LinkPost {
  /**
   * URL to share
   */
  url: string;

  /**
   * Post text/caption
   */
  text?: string;

  /**
   * Link title for platforms that support link cards
   */
  title?: string;

  /**
   * Link description for platforms that support link cards
   */
  description?: string;

  /**
   * Hashtags to include
   */
  tags?: string[];

  /**
   * Scheduled publish time
   */
  scheduledAt?: Date;

  /**
   * Override the adapter/account default link behavior for this post.
   */
  linkBehavior?: LinkBehavior;
}

/**
 * Result from publishing a post
 */
export interface PostResult {
  /**
   * Platform-specific post ID
   */
  id: string;

  /**
   * Public URL of the post
   */
  url: string;

  /**
   * Publication status
   */
  status: 'published' | 'scheduled' | 'processing' | 'staged' | 'dry_run';

  /**
   * When the post was/will be published
   */
  publishedAt?: Date;

  /**
   * Scheduled time (if scheduled)
   */
  scheduledAt?: Date;

  /**
   * Platform-specific metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Retrieved post data
 */
export interface Post {
  /**
   * Platform-specific post ID
   */
  id: string;

  /**
   * Public URL of the post
   */
  url: string;

  /**
   * Post type
   */
  type: 'video' | 'image' | 'text' | 'link';

  /**
   * Post title (if applicable)
   */
  title?: string;

  /**
   * Post description/caption
   */
  description?: string;

  /**
   * When the post was published
   */
  publishedAt: Date;

  /**
   * Current visibility
   */
  visibility: 'public' | 'unlisted' | 'private';

  /**
   * Basic analytics
   */
  analytics?: PostAnalytics;
}

/**
 * Post analytics
 */
export interface PostAnalytics {
  /**
   * View/impression count
   */
  views?: number;

  /**
   * Impression count when the platform distinguishes it from views
   */
  impressions?: number;

  /**
   * Like/favorite count
   */
  likes?: number;

  /**
   * Comment count
   */
  comments?: number;

  /**
   * Share/repost count
   */
  shares?: number;

  /**
   * Click count (for links)
   */
  clicks?: number;

  /**
   * Raw platform analytics payload for debugging and future reporting
   */
  raw?: unknown;

  /**
   * When analytics were last updated
   */
  lastUpdated?: Date;
}

/**
 * Platform capabilities
 */
export interface PlatformCapabilities {
  /**
   * Supports video posts
   */
  video: boolean;

  /**
   * Supports image posts
   */
  image: boolean;

  /**
   * Supports text-only posts
   */
  text: boolean;

  /**
   * Supports first-class link posts or link attachments
   */
  link: boolean;

  /**
   * Supports native link attachments/cards instead of plain inline URLs
   */
  linkAttachment?: boolean;

  /**
   * Supports scheduled posting
   */
  scheduling: boolean;

  /**
   * Supports analytics retrieval
   */
  analytics: boolean;

  /**
   * Analytics can include raw platform payloads
   */
  rawAnalytics?: boolean;

  /**
   * Safety modes supported by this adapter.
   */
  publishModes?: PublishMode[];

  /**
   * Supports a non-public remote staging step before final publish.
   */
  staging?: boolean;

  /**
   * Supports creating private, unpublished, or scheduled platform content.
   */
  privatePublishing?: boolean;

  /**
   * Media publishing requires a publicly accessible URL, not a Buffer upload
   */
  requiresPublicMediaUrl?: boolean;

  /**
   * Maximum video duration in seconds
   */
  maxVideoLength: number;

  /**
   * Maximum video file size in bytes
   */
  maxVideoSize: number;

  /**
   * Supported video formats
   */
  supportedVideoFormats: string[];

  /**
   * Supported aspect ratios
   */
  aspectRatios: string[];

  /**
   * Maximum text length
   */
  maxTextLength: number;

  /**
   * Maximum number of hashtags
   */
  maxHashtags?: number;

  /**
   * Supported high-level post types
   */
  supportedPostTypes?: Array<'text' | 'image' | 'video' | 'link'>;
}

/**
 * Social platform interface
 */
export interface SocialPlatform {
  /**
   * Platform type
   */
  readonly platform: SocialPlatformType;

  /**
   * Authenticate or refresh authentication
   */
  authenticate(credentials?: Record<string, string>): Promise<AuthResult>;

  /**
   * Refresh expired token
   */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /**
   * Publish a video post
   */
  publishVideo(video: VideoPost): Promise<PostResult>;

  /**
   * Publish an image post
   */
  publishImage(image: ImagePost): Promise<PostResult>;

  /**
   * Publish a text post
   */
  publishText(text: TextPost): Promise<PostResult>;

  /**
   * Publish a link post
   */
  publishLink(link: LinkPost): Promise<PostResult>;

  /**
   * Get a post by ID
   */
  getPost(postId: string): Promise<Post>;

  /**
   * Delete a post
   */
  deletePost(postId: string): Promise<void>;

  /**
   * Get analytics for a post
   */
  getAnalytics(postId: string): Promise<PostAnalytics>;

  /**
   * Get platform capabilities
   */
  getCapabilities(): PlatformCapabilities;
}

/**
 * OAuth authorization options
 */
export interface AuthorizationOptions {
  /**
   * OAuth scopes to request
   */
  scopes?: string[];

  /**
   * State parameter for CSRF protection
   */
  state?: string;

  /**
   * Code verifier for PKCE
   */
  codeVerifier?: string;

  /**
   * Redirect URI
   */
  redirectUri?: string;
}

/**
 * OAuth authorization result
 */
export interface AuthorizationResult {
  /**
   * Authorization URL to redirect user to
   */
  url: string;

  /**
   * State parameter (for verification)
   */
  state: string;

  /**
   * Code verifier (for PKCE, store securely)
   */
  codeVerifier?: string;
}

/**
 * OAuth code exchange parameters
 */
export interface CodeExchangeParams {
  /**
   * Authorization code from callback
   */
  code: string;

  /**
   * State parameter (for verification)
   */
  state?: string;

  /**
   * Code verifier (for PKCE)
   */
  codeVerifier?: string;

  /**
   * Redirect URI (must match authorization request)
   */
  redirectUri?: string;
}

/**
 * Error thrown by social platform operations
 */
export class SocialError extends Error {
  constructor(
    message: string,
    public code: string,
    public platform?: SocialPlatformType,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'SocialError';
  }
}

/**
 * Rate limit error
 */
export class SocialRateLimitError extends SocialError {
  constructor(
    platform: SocialPlatformType,
    public retryAfter?: number,
  ) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT',
      platform,
      429,
    );
    this.name = 'SocialRateLimitError';
  }
}

/**
 * Authentication error
 */
export class SocialAuthError extends SocialError {
  constructor(platform: SocialPlatformType, message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', platform, 401);
    this.name = 'SocialAuthError';
  }
}
