/**
 * Local Signal type definitions for logger adapter
 * These types are copied from @have/types to keep logger independent
 */

/**
 * Signal types representing different phases of operation execution
 */
export type SignalType = 'start' | 'step' | 'end' | 'error';

/**
 * Signal - Represents an event in operation execution
 */
export interface Signal {
  /** Unique signal ID */
  id: string;
  /** Signal type */
  type: SignalType;
  /** Object ID that emitted the signal */
  objectId: string;
  /** Class name of the emitting object */
  className: string;
  /** Method name that emitted the signal */
  method: string;
  /** Timestamp when signal was emitted */
  timestamp: Date;
  /** Step description (for 'step' type signals) */
  step?: string;
  /** Operation duration in milliseconds (for 'end' type signals) */
  duration?: number;
  /** Operation result (for 'end' type signals) */
  result?: unknown;
  /** Error information (for 'error' type signals) */
  error?: Error;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Signal Adapter interface - Handles signals for various purposes
 */
export interface SignalAdapter {
  /**
   * Handle a signal
   * @param signal - The signal to handle
   */
  handle(signal: Signal): Promise<void>;
}
