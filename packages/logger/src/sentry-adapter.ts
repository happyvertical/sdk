/**
 * Sentry signal adapter for error tracking
 *
 * Routes SMRT framework signals to Sentry/GlitchTip:
 * - Error signals → Sentry.captureException with scope tags and context
 * - Non-error signals → Sentry.addBreadcrumb for debugging trail
 *
 * Consumer must install @sentry/node and call Sentry.init() before use.
 */

import * as Sentry from '@sentry/node';
import type { Signal, SignalAdapter } from './signal-types.js';

/**
 * Configuration for the Sentry signal adapter
 */
export interface SentryAdapterConfig {
  /** Breadcrumb category (default: 'smrt') */
  category?: string;
}

/**
 * Sentry signal adapter — routes SMRT signals to Sentry/GlitchTip
 *
 * Error signals are captured as exceptions with scope tags and context.
 * All other signal types are added as breadcrumbs for debugging trail.
 * Requires `@sentry/node` to be installed and `Sentry.init()` called before use.
 *
 * @example
 * ```typescript
 * import { createSentryAdapter } from '@happyvertical/logger/sentry';
 *
 * const adapter = createSentryAdapter({ category: 'myapp' });
 * ```
 */
export class SentryAdapter implements SignalAdapter {
  private category: string;

  constructor(config?: SentryAdapterConfig) {
    this.category = config?.category ?? 'smrt';
  }

  /**
   * Handle a signal by routing to Sentry
   *
   * Error signals are captured as exceptions. All other signal types
   * are added as breadcrumbs.
   *
   * @param signal - The signal to handle
   */
  async handle(signal: Signal): Promise<void> {
    if (signal.type === 'error') {
      this.captureError(signal);
    } else {
      this.addBreadcrumb(signal);
    }
  }

  private captureError(signal: Signal): void {
    const error = signal.error ?? new Error('Unknown SMRT error');

    Sentry.withScope((scope) => {
      scope.setTag('smrt.class', signal.className);
      scope.setTag('smrt.method', signal.method);

      scope.setContext('smrt', {
        signalId: signal.id,
        objectId: signal.objectId,
        duration: signal.duration,
        ...signal.metadata,
      });

      Sentry.captureException(error);
    });
  }

  private addBreadcrumb(signal: Signal): void {
    const levelMap: Record<string, Sentry.SeverityLevel> = {
      start: 'debug',
      step: 'debug',
      end: 'info',
      error: 'error',
    };

    let message: string;
    switch (signal.type) {
      case 'start':
        message = `${signal.className}.${signal.method}() started`;
        break;
      case 'step':
        message = `${signal.className}.${signal.method}() step: ${signal.step || 'unknown'}`;
        break;
      case 'end':
        message = `${signal.className}.${signal.method}() completed in ${signal.duration}ms`;
        break;
      default:
        message = `${signal.className}.${signal.method}() ${signal.type}`;
    }

    Sentry.addBreadcrumb({
      category: this.category,
      message,
      level: levelMap[signal.type] || 'info',
      data: {
        signalId: signal.id,
        objectId: signal.objectId,
        className: signal.className,
        method: signal.method,
        ...(signal.duration !== undefined && { duration: signal.duration }),
        ...signal.metadata,
      },
    });
  }
}

/**
 * Create a Sentry signal adapter
 *
 * @param config - Optional configuration (breadcrumb category)
 * @returns Configured SentryAdapter instance
 */
export function createSentryAdapter(
  config?: SentryAdapterConfig,
): SentryAdapter {
  return new SentryAdapter(config);
}
