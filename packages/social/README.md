---
id: social
title: "@happyvertical/social: Social Platform Publishing"
sidebar_label: "@happyvertical/social"
sidebar_position: 11
---

# @happyvertical/social

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A unified interface for publishing content to social platforms in the HAVE SDK.

## Overview

The `@happyvertical/social` package provides adapters for publishing links, text, images, and videos to major social platforms including YouTube, Facebook Pages, Threads, X (Twitter), and Bluesky. Each adapter implements a consistent interface, making it easy to publish to multiple platforms with the same code.

## Features

- **Multi-Platform Support**: YouTube, Facebook Pages, Threads, X (Twitter), Bluesky
- **Unified Interface**: Consistent API across all platforms
- **OAuth Support**: Built-in OAuth 2.0 with PKCE for YouTube and OAuth 1.0a/OAuth 2.0 support for X
- **Media Publishing**: Support for link, text, image, and video content
- **Safety Modes**: Dry-run and non-public publish modes for testing without public posts
- **Cross-Posting**: Publish to multiple platforms simultaneously
- **Analytics**: Retrieve post engagement metrics
- **Platform Capabilities**: Query platform-specific limits and features
- **Type-Safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
# Install with bun (recommended)
bun add @happyvertical/social

# Or with npm
npm install @happyvertical/social

# Or with pnpm
pnpm add @happyvertical/social
```

## Quick Start

### Basic Usage

```typescript
import { getSocial } from '@happyvertical/social';

// YouTube
const youtube = await getSocial({
  type: 'youtube',
  clientId: process.env.YOUTUBE_CLIENT_ID!,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
  accessToken: 'user-access-token',
  refreshToken: 'user-refresh-token',
});

// Publish video
const result = await youtube.publishVideo({
  file: fs.readFileSync('video.mp4'),
  title: 'Breaking News from Bentley',
  description: 'Latest updates from the town council meeting.',
  tags: ['news', 'local', 'bentley'],
});

console.log(`Published: ${result.url}`);
```

### Multiple Platforms

```typescript
import { getSocial, getSocialMulti, publishToAll } from '@happyvertical/social';

// Create adapters for multiple platforms
const adapters = await getSocialMulti([
  {
    type: 'youtube',
    clientId: process.env.YOUTUBE_CLIENT_ID!,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
    accessToken: 'youtube-token',
  },
  {
    type: 'bluesky',
    identifier: 'myhandle.bsky.social',
    password: process.env.BLUESKY_APP_PASSWORD!,
  },
  {
    type: 'x',
    apiKey: process.env.X_API_KEY!,
    apiSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_SECRET!,
  },
  {
    type: 'facebook',
    pageId: process.env.FACEBOOK_PAGE_ID!,
    accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
  },
]);

// Publish a story link to all supported platforms at once
const results = await publishToAll(adapters, {
  type: 'link',
  text: 'Breaking news from Bentley!',
  url: 'https://example.com/article',
  tags: ['news', 'local'],
});

// Check results per platform
for (const [platform, result] of results) {
  if (result.success) {
    console.log(`${platform}: Success`);
  } else {
    console.log(`${platform}: Failed - ${result.error?.message}`);
  }
}
```

### Safety Modes

Adapters default to public publishing for backward compatibility. Set `publishMode` when testing request shapes or creating non-public platform objects.

```typescript
const youtube = await getSocial({
  type: 'youtube',
  clientId: process.env.YOUTUBE_CLIENT_ID!,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
  accessToken: 'user-access-token',
  publishMode: 'private_or_scheduled',
});

const result = await youtube.publishVideo({
  file: videoBuffer,
  title: 'Council update',
  isShort: true,
});

console.log(result.status); // "staged"
```

## Platform Adapters

### YouTube

```typescript
const youtube = await getSocial({
  type: 'youtube',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  accessToken: 'user-access-token',
  refreshToken: 'user-refresh-token',
});

// Publish video (supports Shorts with 9:16 aspect ratio)
await youtube.publishVideo({
  file: videoBuffer,
  title: 'Video Title',
  description: 'Video description with #hashtags',
  tags: ['tag1', 'tag2'],
  visibility: 'public', // 'public' | 'unlisted' | 'private'
  scheduledAt: new Date('2025-02-01'), // Optional scheduling
  thumbnail: thumbnailBuffer, // Custom thumbnail
});

// OAuth flow
const { url, state, codeVerifier } = youtube.getAuthorizationUrl({
  redirectUri: 'https://yourapp.com/callback',
  scopes: ['https://www.googleapis.com/auth/youtube.upload'],
});

// Exchange code for tokens
const tokens = await youtube.exchangeCode({
  code: authorizationCode,
  redirectUri: 'https://yourapp.com/callback',
  codeVerifier,
});
```

### Bluesky

```typescript
const bluesky = await getSocial({
  type: 'bluesky',
  identifier: 'myhandle.bsky.social', // or DID
  password: 'app-password', // Use app password, not main password
  pdsUrl: 'https://bsky.social', // Optional custom PDS
});

// Authenticate
await bluesky.authenticate();

// Publish text with link card
await bluesky.publishText({
  text: 'Check out this article!',
  linkUrl: 'https://example.com/article',
  tags: ['news'],
});

// Publish image
await bluesky.publishImage({
  file: imageBuffer,
  description: 'Image description',
  altText: 'Accessible alt text',
});

// Publish a first-class link card
await bluesky.publishLink({
  url: 'https://example.com/article',
  title: 'Local story',
  description: 'A short summary for the card',
});
```

### X (Twitter)

```typescript
const x = await getSocial({
  type: 'x',
  apiKey: 'consumer-key',
  apiSecret: 'consumer-secret',
  accessToken: 'user-access-token',
  accessSecret: 'user-access-secret',
});

// Authenticate
await x.authenticate();

// Publish text
await x.publishText({
  text: 'Hello from Bentley! 🏔️',
  tags: ['news', 'local'],
});

// Publish with image
await x.publishImage({
  file: imageBuffer,
  description: 'Breaking news',
  altText: 'News headline image',
});

// Publish video
await x.publishVideo({
  file: videoBuffer,
  description: 'Watch the latest update',
  linkUrl: 'https://example.com', // Inline by default
  linkBehavior: 'reply', // Optional: post the link as a reply instead
});
```

### Threads

```typescript
const threads = await getSocial({
  type: 'threads',
  accessToken: 'meta-access-token',
  userId: 'threads-user-id',
});

// Publish text
await threads.publishText({
  text: 'Hello from Threads!',
  tags: ['meta', 'social'],
});

// Publish image (requires publicly accessible URL)
await threads.publishImage({
  file: 'https://example.com/image.png', // URL required, not buffer
  description: 'Image caption',
});

// Publish a link attachment
await threads.publishLink({
  url: 'https://example.com/article',
  text: 'Read the latest story',
});
```

### Facebook Pages

```typescript
const facebook = await getSocial({
  type: 'facebook',
  pageId: 'page-id',
  accessToken: 'page-access-token',
});

// Publish a Page feed link post
await facebook.publishLink({
  url: 'https://example.com/article',
  text: 'Read the latest story',
});

// Create an unpublished Page post for testing
const safeFacebook = await getSocial({
  type: 'facebook',
  pageId: 'page-id',
  accessToken: 'page-access-token',
  publishMode: 'private_or_scheduled',
});

await safeFacebook.publishText({
  text: 'Draft post',
});
```

## API Reference

### SocialPlatform Interface

All adapters implement this interface:

```typescript
interface SocialPlatform {
  readonly platform: string;

  // Authentication
  authenticate(): Promise<AuthResult>;
  refreshToken(token: string): Promise<AuthResult>;

  // Publishing
  publishVideo(video: VideoPost): Promise<PostResult>;
  publishImage(image: ImagePost): Promise<PostResult>;
  publishText(text: TextPost): Promise<PostResult>;
  publishLink(link: LinkPost): Promise<PostResult>;

  // Management
  getPost(postId: string): Promise<Post>;
  deletePost(postId: string): Promise<void>;
  getAnalytics(postId: string): Promise<PostAnalytics>;

  // Capabilities
  getCapabilities(): PlatformCapabilities;
}
```

### Platform Capabilities

```typescript
const caps = youtube.getCapabilities();
console.log(`Max video length: ${caps.maxVideoLength}s`);
console.log(`Max video size: ${caps.maxVideoSize / (1024 * 1024)}MB`);
console.log(`Supports scheduling: ${caps.scheduling}`);
```

| Platform | Link | Video | Image | Text | Scheduling | Safe non-public mode | Max Video |
|----------|------|-------|-------|------|------------|----------------------|-----------|
| YouTube | ✗ | ✓ | ✗ | ✗ | ✓ | private upload | 256GB |
| Facebook Pages | ✓ | ✓ | ✓ | ✓ | ✓ | unpublished/scheduled | 10GB |
| Threads | ✓ | ✓ | ✓ | ✓ | ✗ | staged container | 1GB |
| X | ✓ | ✓ | ✓ | ✓ | ✗ | staged media/dry run | 512MB |
| Bluesky | ✓ | ✗ | ✓ | ✓ | ✗ | dry run/blob staging | N/A |

## Error Handling

```typescript
import {
  getSocial,
  SocialError,
  SocialAuthError,
  SocialRateLimitError,
} from '@happyvertical/social';

try {
  await adapter.publishText({ text: 'Hello!' });
} catch (error) {
  if (error instanceof SocialAuthError) {
    console.error(`Auth error on ${error.platform}: ${error.message}`);
    // Refresh token or re-authenticate
  } else if (error instanceof SocialRateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof SocialError) {
    console.error(`Error: ${error.code} - ${error.message}`);
  }
}
```

## Types

```typescript
interface VideoPost {
  file: Buffer | string;
  title?: string;
  description?: string;
  thumbnail?: Buffer | string;
  tags?: string[];
  linkUrl?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  scheduledAt?: Date;
  categoryId?: string; // YouTube category
  isShort?: boolean;
  linkBehavior?: 'inline' | 'attachment' | 'reply' | 'none';
}

interface ImagePost {
  file: Buffer | string;
  description?: string;
  altText?: string;
  linkUrl?: string;
  tags?: string[];
  linkBehavior?: 'inline' | 'attachment' | 'reply' | 'none';
}

interface TextPost {
  text: string;
  linkUrl?: string;
  tags?: string[];
  replyTo?: string; // Post ID to reply to
  linkBehavior?: 'inline' | 'attachment' | 'reply' | 'none';
}

interface LinkPost {
  url: string;
  text?: string;
  title?: string;
  description?: string;
  tags?: string[];
  scheduledAt?: Date;
  linkBehavior?: 'inline' | 'attachment' | 'reply' | 'none';
}

interface PostResult {
  id: string;
  url: string;
  status: 'published' | 'scheduled' | 'processing' | 'staged' | 'dry_run';
  publishedAt?: Date;
  scheduledAt?: Date;
}

interface PostAnalytics {
  views?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  raw?: unknown;
  lastUpdated?: Date;
}
```

## Best Practices

### Credential Management

```typescript
// Use environment variables
const youtube = await getSocial({
  type: 'youtube',
  clientId: process.env.YOUTUBE_CLIENT_ID!,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
  accessToken: await getStoredToken('youtube'),
});

// Implement token refresh
youtube.authenticate().catch(async (error) => {
  if (error instanceof SocialAuthError) {
    const refreshed = await youtube.refreshToken(storedRefreshToken);
    await storeToken('youtube', refreshed.accessToken);
  }
});
```

### Platform-Specific Optimization

```typescript
// X: Inline links by default, or post links as replies per account/post
await x.publishVideo({
  file: videoBuffer,
  description: 'Watch the news',
  linkUrl: 'https://example.com/article',
  linkBehavior: 'reply',
});

// YouTube: Use scheduling for optimal posting times
await youtube.publishVideo({
  file: videoBuffer,
  title: 'Morning News',
  scheduledAt: new Date('2025-01-27T08:00:00Z'),
});
```

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
