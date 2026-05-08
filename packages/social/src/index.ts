/**
 * @happyvertical/social
 *
 * Unified social platform publishing SDK.
 * Supports YouTube, Threads, X (Twitter), and Bluesky.
 */

export { BlueskyAdapter } from './adapters/bluesky.js';
export { FacebookPageAdapter } from './adapters/facebook.js';
export { ThreadsAdapter } from './adapters/threads.js';
export { XAdapter } from './adapters/x.js';
export { YouTubeAdapter } from './adapters/youtube.js';
export * from './types.js';

import { BlueskyAdapter } from './adapters/bluesky.js';
import { FacebookPageAdapter } from './adapters/facebook.js';
import { ThreadsAdapter } from './adapters/threads.js';
import { XAdapter } from './adapters/x.js';
import { YouTubeAdapter } from './adapters/youtube.js';
import type { SocialConfig, SocialPlatform } from './types.js';
import { SocialError } from './types.js';

/**
 * Factory function to create a social platform adapter
 *
 * @example
 * ```typescript
 * import { getSocial } from '@happyvertical/social';
 *
 * // YouTube
 * const youtube = await getSocial({
 *   type: 'youtube',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   accessToken: 'user-access-token',
 * });
 *
 * // Bluesky
 * const bluesky = await getSocial({
 *   type: 'bluesky',
 *   identifier: 'handle.bsky.social',
 *   password: 'app-password',
 * });
 *
 * // X (Twitter)
 * const x = await getSocial({
 *   type: 'x',
 *   apiKey: 'consumer-key',
 *   apiSecret: 'consumer-secret',
 *   accessToken: 'user-access-token',
 *   accessSecret: 'user-access-secret',
 * });
 *
 * // Threads
 * const threads = await getSocial({
 *   type: 'threads',
 *   accessToken: 'user-access-token',
 *   userId: 'threads-user-id',
 * });
 *
 * // Publish text
 * const result = await youtube.publishText({
 *   text: 'Hello from Bentley!',
 * });
 * ```
 */
export async function getSocial(config: SocialConfig): Promise<SocialPlatform> {
  let adapter: SocialPlatform;

  switch (config.type) {
    case 'youtube':
      adapter = new YouTubeAdapter(config);
      break;
    case 'threads':
      adapter = new ThreadsAdapter(config);
      break;
    case 'facebook':
      adapter = new FacebookPageAdapter(config);
      break;
    case 'x':
      adapter = new XAdapter(config);
      break;
    case 'bluesky':
      adapter = new BlueskyAdapter(config);
      break;
    default:
      throw new SocialError(
        `Unknown platform type: ${(config as { type?: string }).type}`,
        'UNKNOWN_PLATFORM',
      );
  }

  return adapter;
}

/**
 * Create multiple social platform adapters at once
 *
 * @example
 * ```typescript
 * import { getSocialMulti } from '@happyvertical/social';
 *
 * const adapters = await getSocialMulti([
 *   { type: 'youtube', clientId: '...', clientSecret: '...', accessToken: '...' },
 *   { type: 'bluesky', identifier: '...', password: '...' },
 * ]);
 *
 * // Publish to all platforms
 * const results = await Promise.all(
 *   adapters.map(adapter => adapter.publishText({ text: 'Hello!' }))
 * );
 * ```
 */
export async function getSocialMulti(
  configs: SocialConfig[],
): Promise<SocialPlatform[]> {
  return Promise.all(configs.map(getSocial));
}

/**
 * Publish content to multiple platforms at once
 *
 * @example
 * ```typescript
 * import { publishToAll, getSocialMulti } from '@happyvertical/social';
 *
 * const adapters = await getSocialMulti([...]);
 *
 * const results = await publishToAll(adapters, {
 *   type: 'text',
 *   text: 'Breaking news from Bentley!',
 *   linkUrl: 'https://example.com/article',
 *   tags: ['news', 'local'],
 * });
 * ```
 */
export async function publishToAll(
  adapters: SocialPlatform[],
  content: {
    type: 'text' | 'image' | 'video' | 'link';
    text?: string;
    description?: string;
    file?: Buffer | string;
    title?: string;
    linkUrl?: string;
    url?: string;
    tags?: string[];
    altText?: string;
    mimeType?: string;
    thumbnail?: Buffer | string;
    thumbnailMimeType?: string;
  },
): Promise<Map<string, { success: boolean; result?: unknown; error?: Error }>> {
  const results = new Map<
    string,
    { success: boolean; result?: unknown; error?: Error }
  >();

  await Promise.all(
    adapters.map(async (adapter) => {
      try {
        let result: unknown;

        switch (content.type) {
          case 'text':
            result = await adapter.publishText({
              text: content.text ?? content.description ?? '',
              linkUrl: content.linkUrl,
              tags: content.tags,
            });
            break;
          case 'link': {
            const url = content.url ?? content.linkUrl;
            if (!url) {
              throw new SocialError(
                'Link URL required',
                'MISSING_LINK_URL',
                adapter.platform,
              );
            }
            result = await adapter.publishLink({
              url,
              text: content.text,
              title: content.title,
              description: content.description,
              tags: content.tags,
            });
            break;
          }
          case 'image':
            if (!content.file) {
              throw new SocialError(
                'Image file required',
                'MISSING_FILE',
                adapter.platform,
              );
            }
            result = await adapter.publishImage({
              file: content.file,
              description: content.description ?? content.text,
              linkUrl: content.linkUrl,
              tags: content.tags,
              altText: content.altText,
              mimeType: content.mimeType,
            });
            break;
          case 'video':
            if (!content.file) {
              throw new SocialError(
                'Video file required',
                'MISSING_FILE',
                adapter.platform,
              );
            }
            result = await adapter.publishVideo({
              file: content.file,
              title: content.title,
              description: content.description ?? content.text,
              linkUrl: content.linkUrl,
              tags: content.tags,
              mimeType: content.mimeType,
              thumbnail: content.thumbnail,
              thumbnailMimeType: content.thumbnailMimeType,
            });
            break;
        }

        results.set(adapter.platform, { success: true, result });
      } catch (error) {
        results.set(adapter.platform, {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }),
  );

  return results;
}
