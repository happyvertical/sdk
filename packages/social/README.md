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

The `@happyvertical/social` package provides adapters for publishing text, images, and videos to major social platforms including YouTube, Threads, X (Twitter), and Bluesky. Each adapter implements a consistent interface, making it easy to publish to multiple platforms with the same code.

## Features

- **Multi-Platform Support**: YouTube, Threads, X (Twitter), Bluesky
- **Unified Interface**: Consistent API across all platforms
- **OAuth Support**: Built-in OAuth 2.0 with PKCE for YouTube
- **Media Publishing**: Support for text, images, and video content
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
]);

// Publish to all platforms at once
const results = await publishToAll(adapters, {
  type: 'text',
  text: 'Breaking news from Bentley!',
  linkUrl: 'https://example.com/article',
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
  linkUrl: 'https://example.com', // Posted as reply for better algorithm
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

| Platform | Video | Image | Text | Scheduling | Max Video |
|----------|-------|-------|------|------------|-----------|
| YouTube | ✓ | ✗ | ✗ | ✓ | 256GB |
| Threads | ✓ | ✓ | ✓ | ✗ | 1GB |
| X | ✓ | ✓ | ✓ | ✗ | 512MB |
| Bluesky | ✗ | ✓ | ✓ | ✗ | N/A |

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
}

interface ImagePost {
  file: Buffer | string;
  description?: string;
  altText?: string;
  linkUrl?: string;
  tags?: string[];
}

interface TextPost {
  text: string;
  linkUrl?: string;
  tags?: string[];
  replyTo?: string; // Post ID to reply to
}

interface PostResult {
  id: string;
  url: string;
  status: 'published' | 'scheduled' | 'processing';
  publishedAt?: Date;
  scheduledAt?: Date;
}

interface PostAnalytics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
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
// X: Post link as reply for better algorithm performance
// The adapter handles this automatically when linkUrl is provided
await x.publishVideo({
  file: videoBuffer,
  description: 'Watch the news',
  linkUrl: 'https://example.com/article', // Posted as separate reply
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
