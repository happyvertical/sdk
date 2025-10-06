/**
 * Signal Bus for Universal Event Distribution
 *
 * This module provides the central SignalBus for distributing signals
 * to registered adapters (logging, metrics, pub/sub, etc.).
 */

import type { Signal, ISignalAdapter } from '@have/types';
import { makeId } from '@have/utils';

/**
 * Central signal distribution bus
 *
 * SignalBus manages adapter registration and signal distribution
 * with fire-and-forget error handling.
 */
export class SignalBus {
  private adapters: ISignalAdapter[] = [];

  /**
   * Register a signal adapter
   *
   * @param adapter - Adapter to register
   */
  register(adapter: ISignalAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Unregister a signal adapter
   *
   * @param adapter - Adapter to unregister
   */
  unregister(adapter: ISignalAdapter): void {
    this.adapters = this.adapters.filter((a) => a !== adapter);
  }

  /**
   * Emit a signal to all registered adapters
   *
   * Adapters are called in fire-and-forget mode - errors are logged
   * but don't interrupt the main execution flow.
   *
   * @param signal - Signal to emit
   */
  async emit(signal: Signal): Promise<void> {
    // Fire-and-forget - don't await adapter promises
    const promises = this.adapters.map(async (adapter) => {
      try {
        await adapter.handle(signal);
      } catch (error) {
        // Log adapter errors but don't throw
        console.error(
          `SignalBus: Adapter error for signal ${signal.id}:`,
          error,
        );
      }
    });

    // Don't wait for adapters to complete
    // They execute asynchronously without blocking the main flow
    void Promise.allSettled(promises);
  }

  /**
   * Generate unique execution ID for method invocations
   *
   * @returns Unique execution ID (CUID2)
   */
  generateExecutionId(): string {
    return makeId();
  }

  /**
   * Get count of registered adapters
   *
   * @returns Number of registered adapters
   */
  get adapterCount(): number {
    return this.adapters.length;
  }

  /**
   * Clear all registered adapters
   *
   * Useful for testing or resetting the bus
   */
  clearAdapters(): void {
    this.adapters = [];
  }
}
