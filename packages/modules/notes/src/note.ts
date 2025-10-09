/**
 * Note - Core entity for hierarchical note-taking on any SmrtObject
 *
 * Designed for self-learning discovery patterns where AI-learned strategies
 * (regex patterns, selectors) are cached and reused to minimize costs.
 */

import { SmrtObject, smrt, type SmrtObjectOptions } from '@have/smrt';
import type { NoteMetadata } from './types.js';

@smrt({
  api: { include: ['list', 'get', 'create', 'update', 'delete'] },
  mcp: { include: ['list', 'get', 'create', 'update'] },
  cli: true,
})
export class Note extends SmrtObject {
  // Ownership and hierarchy
  ownerId = ''; // UUID - can be any SmrtObject's id
  parentId: string | null = null; // FK to parent Note (self-referencing)

  // Scoping and identification
  scope = 'global'; // Hierarchical: 'discovery/parser/domain.com/page-type'
  key = ''; // Normalized URL or identifier

  // Data storage
  value = ''; // JSON-serialized (regex patterns, selectors, etc.)
  metadata = ''; // JSON metadata

  // Hierarchy
  level = 0; // Hierarchy depth (0 = root)

  // Versioning and confidence
  version = 1; // Strategy version (1, 2, 3...)
  confidence = 1.0; // 0.0 to 1.0

  // Performance tracking
  successCount = 0; // Times strategy worked
  failureCount = 0; // Times strategy failed

  // Timestamps
  createdAt = new Date();
  updatedAt = new Date();
  lastUsed: Date | null = null; // Track recency for time decay
  expiresAt: Date | null = null; // Optional expiration

  /**
   * Get value as parsed object
   */
  getValue<T = any>(): T {
    if (!this.value) return {} as T;
    try {
      return JSON.parse(this.value);
    } catch {
      return {} as T;
    }
  }

  /**
   * Set value from object
   */
  setValue(value: any): void {
    this.value = JSON.stringify(value);
  }

  /**
   * Get metadata as parsed object
   */
  getMetadata(): NoteMetadata {
    if (!this.metadata) return {};
    try {
      return JSON.parse(this.metadata);
    } catch {
      return {};
    }
  }

  /**
   * Set metadata from object
   */
  setMetadata(metadata: NoteMetadata): void {
    this.metadata = JSON.stringify(metadata);
  }

  /**
   * Update metadata by merging with existing values
   */
  updateMetadata(updates: Partial<NoteMetadata>): void {
    const current = this.getMetadata();
    this.setMetadata({ ...current, ...updates });
  }

  /**
   * Record successful use of this strategy
   * Increments successCount and slightly boosts confidence
   */
  recordSuccess(): void {
    this.successCount++;
    this.lastUsed = new Date();

    // Boost confidence slightly (max 1.0)
    this.confidence = Math.min(1.0, this.confidence + 0.05);

    this.updatedAt = new Date();
  }

  /**
   * Record failed use of this strategy
   * Increments failureCount and significantly penalizes confidence
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastUsed = new Date();

    // Penalize confidence significantly
    this.confidence = Math.max(0.0, this.confidence - 0.2);

    this.updatedAt = new Date();
  }

  /**
   * Apply time-based confidence decay
   * Reduces confidence based on time since last use
   *
   * @param decayRate - Rate of decay (default: 0.05)
   */
  applyTimeDecay(decayRate = 0.05): void {
    if (!this.lastUsed) return;

    const daysSinceUse =
      (Date.now() - this.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    const decay = Math.exp(-decayRate * daysSinceUse);

    this.confidence = this.confidence * decay;
    this.updatedAt = new Date();
  }

  /**
   * Get health score as ratio of successes to total attempts
   *
   * @returns Number between 0 and 1, or null if no attempts
   */
  getHealthScore(): number | null {
    const total = this.successCount + this.failureCount;
    if (total === 0) return null;
    return this.successCount / total;
  }
}
