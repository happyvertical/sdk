import { describe, expect, it } from 'vitest';
import {
  BlueskyAdapter,
  getSocial,
  SocialAuthError,
  SocialError,
  SocialRateLimitError,
  ThreadsAdapter,
  XAdapter,
  YouTubeAdapter,
} from './index.js';

describe('social package', () => {
  describe('exports', () => {
    it('should export getSocial factory function', () => {
      expect(typeof getSocial).toBe('function');
    });

    it('should export adapter classes', () => {
      expect(YouTubeAdapter).toBeDefined();
      expect(ThreadsAdapter).toBeDefined();
      expect(XAdapter).toBeDefined();
      expect(BlueskyAdapter).toBeDefined();
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
