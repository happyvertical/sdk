import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Signal } from './signal-types.js';

// Mock @sentry/node before importing the adapter
vi.mock('@sentry/node', () => ({
  withScope: vi.fn((callback) =>
    callback({
      setTag: vi.fn(),
      setContext: vi.fn(),
    }),
  ),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { createSentryAdapter, SentryAdapter } from './sentry-adapter.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    type: 'start',
    objectId: 'obj-1',
    className: 'Product',
    method: 'save',
    timestamp: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SentryAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('error signals', () => {
    it('should call captureException with scope tags for error signals', async () => {
      const adapter = new SentryAdapter();
      const error = new Error('Database connection failed');
      const signal = makeSignal({
        type: 'error',
        error,
        metadata: { table: 'products' },
      });

      await adapter.handle(signal);

      expect(Sentry.withScope).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);

      // Verify scope was configured
      const scopeCallback = vi.mocked(Sentry.withScope).mock.calls[0][0] as (
        scope: any,
      ) => void;
      const mockScope = { setTag: vi.fn(), setContext: vi.fn() };
      scopeCallback(mockScope);

      expect(mockScope.setTag).toHaveBeenCalledWith('smrt.class', 'Product');
      expect(mockScope.setTag).toHaveBeenCalledWith('smrt.method', 'save');
      expect(mockScope.setContext).toHaveBeenCalledWith('smrt', {
        signalId: 'sig-1',
        objectId: 'obj-1',
        duration: undefined,
        table: 'products',
      });
    });

    it('should create a fallback error when signal has no error', async () => {
      const adapter = new SentryAdapter();
      const signal = makeSignal({ type: 'error' });

      await adapter.handle(signal);

      const capturedError = vi.mocked(Sentry.captureException).mock
        .calls[0][0] as Error;
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('Unknown SMRT error');
    });
  });

  describe('breadcrumb signals', () => {
    it('should add breadcrumb for start signals with debug level', async () => {
      const adapter = new SentryAdapter();
      await adapter.handle(makeSignal({ type: 'start' }));

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'smrt',
        message: 'Product.save() started',
        level: 'debug',
        data: {
          signalId: 'sig-1',
          objectId: 'obj-1',
          className: 'Product',
          method: 'save',
        },
      });
    });

    it('should add breadcrumb for step signals with step description', async () => {
      const adapter = new SentryAdapter();
      await adapter.handle(makeSignal({ type: 'step', step: 'validating' }));

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Product.save() step: validating',
          level: 'debug',
        }),
      );
    });

    it('should add breadcrumb for end signals with info level and duration', async () => {
      const adapter = new SentryAdapter();
      await adapter.handle(makeSignal({ type: 'end', duration: 42 }));

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Product.save() completed in 42ms',
          level: 'info',
          data: expect.objectContaining({ duration: 42 }),
        }),
      );
    });

    it('should use custom category when configured', async () => {
      const adapter = new SentryAdapter({ category: 'myapp' });
      await adapter.handle(makeSignal({ type: 'start' }));

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'myapp' }),
      );
    });

    it('should include metadata in breadcrumb data', async () => {
      const adapter = new SentryAdapter();
      await adapter.handle(
        makeSignal({ type: 'start', metadata: { tenant: 'acme' } }),
      );

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenant: 'acme' }),
        }),
      );
    });

    it('should not call captureException for non-error signals', async () => {
      const adapter = new SentryAdapter();
      await adapter.handle(makeSignal({ type: 'start' }));
      await adapter.handle(makeSignal({ type: 'step' }));
      await adapter.handle(makeSignal({ type: 'end' }));

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });
  });

  describe('createSentryAdapter factory', () => {
    it('should create adapter with default config', () => {
      const adapter = createSentryAdapter();
      expect(adapter).toBeInstanceOf(SentryAdapter);
    });

    it('should create adapter with custom config', () => {
      const adapter = createSentryAdapter({ category: 'custom' });
      expect(adapter).toBeInstanceOf(SentryAdapter);
    });
  });
});
