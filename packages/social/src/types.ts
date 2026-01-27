/**
 * Social Platform Types
 *
 * Unified interface for publishing to social media platforms.
 */

/**
 * Supported social platforms
 */
export type SocialPlatformType = 'youtube' | 'threads' | 'x' | 'bluesky';

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
 * X (Twitter) configuration
 */
export interface XConfig extends BaseSocialConfig {
  type: 'x';

  /**
   * API key (consumer key)
   */
  apiKey: string;

  /**
   * API secret (consumer secret)
   */
  apiSecret: string;

  /**
   * User access token
   */
  accessToken: string;

  /**
   * User access token secret
   */
  accessSecret: string;
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
  status: 'published' | 'scheduled' | 'processing';

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
  type: 'video' | 'image' | 'text';

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
   * Supports scheduled posting
   */
  scheduling: boolean;

  /**
   * Supports analytics retrieval
   */
  analytics: boolean;

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
