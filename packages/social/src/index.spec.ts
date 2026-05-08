import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BlueskyAdapter,
  FacebookPageAdapter,
  getSocial,
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
  ThreadsAdapter,
  XAdapter,
  YouTubeAdapter,
} from './index.js';

describe('social package', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('exports', () => {
    it('should export getSocial factory function', () => {
      expect(typeof getSocial).toBe('function');
    });

    it('should export adapter classes', () => {
      expect(YouTubeAdapter).toBeDefined();
      expect(ThreadsAdapter).toBeDefined();
      expect(XAdapter).toBeDefined();
      expect(BlueskyAdapter).toBeDefined();
      expect(FacebookPageAdapter).toBeDefined();
    });

    it('should export error classes', () => {
      expect(SocialError).toBeDefined();
      expect(SocialAuthError).toBeDefined();
      expect(SocialRateLimitError).toBeDefined();
    });
  });

  describe('getSocial', () => {
    it('should create YouTubeAdapter', async () => {
      const adapter = await getSocial({
        type: 'youtube',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
      expect(adapter).toBeInstanceOf(YouTubeAdapter);
      expect(adapter.platform).toBe('youtube');
    });

    it('should create ThreadsAdapter', async () => {
      const adapter = await getSocial({
        type: 'threads',
        accessToken: 'test-token',
        userId: 'test-user-id',
      });
      expect(adapter).toBeInstanceOf(ThreadsAdapter);
      expect(adapter.platform).toBe('threads');
    });

    it('should create XAdapter', async () => {
      const adapter = await getSocial({
        type: 'x',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessSecret: 'test-access-secret',
      });
      expect(adapter).toBeInstanceOf(XAdapter);
      expect(adapter.platform).toBe('x');
    });

    it('should create BlueskyAdapter', async () => {
      const adapter = await getSocial({
        type: 'bluesky',
        identifier: 'test.bsky.social',
        password: 'test-app-password',
      });
      expect(adapter).toBeInstanceOf(BlueskyAdapter);
      expect(adapter.platform).toBe('bluesky');
    });

    it('should create FacebookPageAdapter', async () => {
      const adapter = await getSocial({
        type: 'facebook',
        accessToken: 'test-token',
        pageId: 'test-page-id',
      });
      expect(adapter).toBeInstanceOf(FacebookPageAdapter);
      expect(adapter.platform).toBe('facebook');
    });
  });

  describe('link publishing', () => {
    it('should dry-run X link posts without calling the API', async () => {
      const fetchMock = vi.mocked(fetch);
      const adapter = new XAdapter({
        type: 'x',
        apiKey: 'key',
        apiSecret: 'secret',
        accessToken: 'token',
        accessSecret: 'access-secret',
        publishMode: 'dry_run',
      });

      const result = await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      expect(result.status).toBe('dry_run');
      expect(result.metadata?.publishMode).toBe('dry_run');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should publish X link posts with inline URLs by default', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'tweet-1' } }), {
          status: 200,
        }),
      );

      const adapter = new XAdapter({
        type: 'x',
        apiKey: 'key',
        apiSecret: 'secret',
        accessToken: 'token',
        accessSecret: 'access-secret',
      });

      await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body.text).toContain('Story from Bentley');
      expect(body.text).toContain('https://bentleyalberta.com/story');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should publish X OAuth2 link posts with bearer auth', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'tweet-1' } }), {
          status: 200,
        }),
      );

      const adapter = new XAdapter({
        type: 'x',
        authType: 'oauth2',
        accessToken: 'oauth2-token',
      });

      await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer oauth2-token',
      });
    });

    it('should stage X OAuth2 media through v2 upload endpoints', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: { id: 'media-1', media_key: '13_media-1' },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: { id: 'media-1', media_key: '13_media-1' },
            }),
            { status: 200 },
          ),
        );

      const adapter = new XAdapter({
        type: 'x',
        authType: 'oauth2',
        accessToken: 'oauth2-token',
        publishMode: 'stage_remote',
      });

      const result = await adapter.publishVideo({
        file: Buffer.from('video-bytes'),
        description: 'Story from Bentley',
      });

      expect(result.status).toBe('staged');
      expect(result.id).toBe('media-1');
      expect(result.metadata?.remoteId).toBe('media-1');
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'https://api.x.com/2/media/upload',
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should publish Threads link posts using link_attachment', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'thread-1' }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'thread-1',
              permalink: 'https://threads.net/@test/post/thread-1',
            }),
            { status: 200 },
          ),
        );

      const adapter = new ThreadsAdapter({
        type: 'threads',
        accessToken: 'token',
        userId: 'threads-user',
      });

      await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(body.media_type).toBe('TEXT');
      expect(body.text).toBe('Story from Bentley');
      expect(body.link_attachment).toBe('https://bentleyalberta.com/story');
    });

    it('should stage Threads link containers without publishing', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'container-1' }), { status: 200 }),
      );

      const adapter = new ThreadsAdapter({
        type: 'threads',
        accessToken: 'token',
        userId: 'threads-user',
        publishMode: 'stage_remote',
      });

      const result = await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      expect(result.status).toBe('staged');
      expect(result.id).toBe('container-1');
      expect(result.metadata?.publishMode).toBe('stage_remote');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        '/threads-user/threads',
      );
    });

    it('should publish Facebook Page link posts to the feed endpoint', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ id: 'page-1_post-1' }), { status: 200 }),
      );

      const adapter = new FacebookPageAdapter({
        type: 'facebook',
        accessToken: 'page-token',
        pageId: 'page-1',
      });

      await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [url, init] = firstCall ?? [];
      expect(String(url)).toContain('/page-1/feed');
      expect(init?.method).toBe('POST');
      const body = init?.body as URLSearchParams;
      expect(body.get('message')).toBe('Story from Bentley');
      expect(body.get('link')).toBe('https://bentleyalberta.com/story');
      expect(body.get('access_token')).toBe('page-token');
    });

    it('should create unpublished Facebook Page link posts in safe mode', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ id: 'page-1_post-1' }), { status: 200 }),
      );

      const adapter = new FacebookPageAdapter({
        type: 'facebook',
        accessToken: 'page-token',
        pageId: 'page-1',
        publishMode: 'private_or_scheduled',
      });

      const result = await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        text: 'Story from Bentley',
      });

      const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
      expect(body.get('published')).toBe('false');
      expect(result.status).toBe('staged');
      expect(result.metadata?.safety).toBe(true);
    });

    it('should dry-run YouTube video uploads without fetching media', async () => {
      const fetchMock = vi.mocked(fetch);
      const adapter = new YouTubeAdapter({
        type: 'youtube',
        clientId: 'client',
        clientSecret: 'secret',
        accessToken: 'token',
        publishMode: 'dry_run',
      });

      const result = await adapter.publishVideo({
        file: 'https://cdn.example.com/video.mp4',
        title: 'Story video',
        isShort: true,
      });

      expect(result.status).toBe('dry_run');
      expect(result.metadata?.payload).toMatchObject({
        title: 'Story video',
        privacyStatus: 'private',
        isShort: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should keep YouTube safe-mode uploads private and staged', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          new Response('', {
            status: 200,
            headers: { Location: 'https://upload.youtube.test/session' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'video-1',
              snippet: {
                channelId: 'channel-1',
                channelTitle: 'Bentley',
              },
            }),
            { status: 200 },
          ),
        );

      const adapter = new YouTubeAdapter({
        type: 'youtube',
        clientId: 'client',
        clientSecret: 'secret',
        accessToken: 'token',
        publishMode: 'private_or_scheduled',
      });

      const result = await adapter.publishVideo({
        file: Buffer.from('video-bytes'),
        title: 'Story video',
      });

      const metadata = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(metadata.status.privacyStatus).toBe('private');
      expect(result.status).toBe('staged');
      expect(result.metadata?.privacyStatus).toBe('private');
      expect(result.metadata?.safety).toBe(true);
    });

    it('should dry-run Bluesky link records without authenticating', async () => {
      const fetchMock = vi.mocked(fetch);
      const adapter = new BlueskyAdapter({
        type: 'bluesky',
        identifier: 'test.bsky.social',
        password: 'app-password',
        publishMode: 'dry_run',
      });

      const result = await adapter.publishLink({
        url: 'https://bentleyalberta.com/story',
        title: 'Story from Bentley',
      });

      expect(result.status).toBe('dry_run');
      expect(result.metadata?.payload).toMatchObject({
        text: 'Story from Bentley',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('error classes', () => {
    it('should create SocialError with message and code', () => {
      const error = new SocialError('Test error', 'TEST_CODE', 'youtube');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.platform).toBe('youtube');
      expect(error).toBeInstanceOf(Error);
    });

    it('should create SocialAuthError', () => {
      const error = new SocialAuthError('youtube', 'Auth failed');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.platform).toBe('youtube');
      expect(error).toBeInstanceOf(SocialError);
    });

    it('should create SocialRateLimitError', () => {
      const error = new SocialRateLimitError('threads', 60);
      expect(error.code).toBe('RATE_LIMIT');
      expect(error.platform).toBe('threads');
      expect(error.retryAfter).toBe(60);
      expect(error).toBeInstanceOf(SocialError);
    });
  });
});
