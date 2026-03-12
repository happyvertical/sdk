/**
 * Tests for the onUsage callback feature
 *
 * These tests verify that the onUsage callback is properly wired into providers
 * and emits correctly shaped UsageEvent objects.
 */

import { describe, expect, it, vi } from 'vitest';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { OpenAIProvider } from './shared/providers/openai';
import type { UsageEvent } from './shared/types';

describe('onUsage callback', () => {
  describe('OpenAIProvider', () => {
    it('should store onUsage in options', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      expect((provider as any).options.onUsage).toBe(onUsage);
    });

    it('should call emitUsage with correct shape', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      // Call the private emitUsage directly to verify the shape
      const startTime = Date.now() - 100;
      (provider as any).emitUsage(
        'chat',
        'gpt-4o',
        { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        startTime,
      );

      expect(onUsage).toHaveBeenCalledTimes(1);
      const event: UsageEvent = onUsage.mock.calls[0][0];

      expect(event.provider).toBe('openai');
      expect(event.model).toBe('gpt-4o');
      expect(event.operation).toBe('chat');
      expect(event.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(event.duration).toBeGreaterThanOrEqual(0);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should not throw when onUsage is not provided', () => {
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
      });

      // Should not throw
      expect(() => {
        (provider as any).emitUsage('chat', 'gpt-4o', undefined, Date.now());
      }).not.toThrow();
    });

    it('should swallow errors thrown by onUsage callback', () => {
      const onUsage = vi.fn().mockImplementation(() => {
        throw new Error('Consumer error');
      });

      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      // Should not throw even though the callback throws
      expect(() => {
        (provider as any).emitUsage(
          'chat',
          'gpt-4o',
          { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          Date.now(),
        );
      }).not.toThrow();

      // But the callback was still called
      expect(onUsage).toHaveBeenCalledTimes(1);
    });

    it('should emit undefined usage when no token data available', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      (provider as any).emitUsage('stream', 'gpt-4o', undefined, Date.now());

      expect(onUsage).toHaveBeenCalledTimes(1);
      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.usage).toBeUndefined();
      expect(event.operation).toBe('stream');
    });

    it('should calculate positive duration', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      const startTime = Date.now() - 50; // 50ms ago
      (provider as any).emitUsage(
        'embed',
        'text-embedding-3-small',
        undefined,
        startTime,
      );

      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('HuggingFaceProvider', () => {
    it('should store onUsage in options', () => {
      const onUsage = vi.fn();
      const provider = new HuggingFaceProvider({
        type: 'huggingface',
        apiToken: 'test-token',
        onUsage,
      });

      expect((provider as any).options.onUsage).toBe(onUsage);
    });

    it('should emit usage events with correct provider name', () => {
      const onUsage = vi.fn();
      const provider = new HuggingFaceProvider({
        type: 'huggingface',
        apiToken: 'test-token',
        onUsage,
      });

      (provider as any).emitUsage('chat', 'gpt2', undefined, Date.now());

      expect(onUsage).toHaveBeenCalledTimes(1);
      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.provider).toBe('huggingface');
      expect(event.model).toBe('gpt2');
    });
  });

  describe('UsageEvent shape validation', () => {
    it('should have all required fields', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      (provider as any).emitUsage(
        'chat',
        'gpt-4o',
        { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        Date.now() - 200,
      );

      const event: UsageEvent = onUsage.mock.calls[0][0];

      // Verify all required fields exist
      expect(event).toHaveProperty('provider');
      expect(event).toHaveProperty('model');
      expect(event).toHaveProperty('operation');
      expect(event).toHaveProperty('duration');
      expect(event).toHaveProperty('timestamp');

      // Verify types
      expect(typeof event.provider).toBe('string');
      expect(typeof event.model).toBe('string');
      expect(typeof event.operation).toBe('string');
      expect(typeof event.duration).toBe('number');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should support all operation types', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      const operations: UsageEvent['operation'][] = ['chat', 'embed', 'stream'];

      for (const op of operations) {
        (provider as any).emitUsage(op, 'gpt-4o', undefined, Date.now());
      }

      expect(onUsage).toHaveBeenCalledTimes(operations.length);

      for (let i = 0; i < operations.length; i++) {
        expect(onUsage.mock.calls[i][0].operation).toBe(operations[i]);
      }
    });
  });

  describe('usageTags', () => {
    it('should include global tags when no per-call tags provided', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        usageTags: { app: 'indagator', team: 'news' },
        onUsage,
      });

      (provider as any).emitUsage('chat', 'gpt-4o', undefined, Date.now());

      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.tags).toEqual({ app: 'indagator', team: 'news' });
    });

    it('should include per-call tags when no global tags set', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      (provider as any).emitUsage('chat', 'gpt-4o', undefined, Date.now(), {
        feature: 'summarize',
      });

      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.tags).toEqual({ feature: 'summarize' });
    });

    it('should merge per-call tags over global tags', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        usageTags: { app: 'indagator', env: 'prod' },
        onUsage,
      });

      (provider as any).emitUsage('chat', 'gpt-4o', undefined, Date.now(), {
        feature: 'entity-discovery',
        env: 'staging',
      });

      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.tags).toEqual({
        app: 'indagator',
        env: 'staging',
        feature: 'entity-discovery',
      });
    });

    it('should omit tags when neither global nor per-call tags are set', () => {
      const onUsage = vi.fn();
      const provider = new OpenAIProvider({
        apiKey: 'test-key',
        onUsage,
      });

      (provider as any).emitUsage('chat', 'gpt-4o', undefined, Date.now());

      const event: UsageEvent = onUsage.mock.calls[0][0];
      expect(event.tags).toBeUndefined();
    });
  });
});
