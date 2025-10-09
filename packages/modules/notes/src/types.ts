/**
 * Type definitions for @have/notes package
 */

import type { SmrtObjectOptions } from '@have/smrt';
import type { Note } from './note.js';

/**
 * Options for creating a Note instance
 */
export interface NoteOptions extends SmrtObjectOptions {
  ownerId?: string;
  parentId?: string | null;
  scope?: string;
  key?: string;
  value?: string | object;
  metadata?: string | NoteMetadata;
  level?: number;
  version?: number;
  confidence?: number;
  successCount?: number;
  failureCount?: number;
  lastUsed?: Date | null;
  expiresAt?: Date | null;
}

/**
 * Note metadata structure
 * Optimized for storing AI-learned strategies (regex patterns, selectors)
 */
export interface NoteMetadata {
  // Original metadata from AI
  aiProvider?: string; // 'openai', 'anthropic', 'google', etc.
  aiModel?: string; // Model used for learning
  aiConfidence?: number; // Original AI confidence

  // Strategy details (primary use case: regex patterns)
  patterns?: string[]; // Regex patterns
  selectors?: string[]; // CSS selectors
  expectedCount?: number; // Expected result count
  pageHash?: string; // Hash of page HTML for change detection

  // Performance tracking
  tags?: string[]; // ['auto-learned', 'human-reviewed', etc.]
  importance?: number;
  source?: string;

  // Version history
  replacesVersion?: number; // Links to previous version

  // Human review
  humanReviewed?: boolean;
  reviewedBy?: string;
  reviewNotes?: string;

  // Allow any other properties
  [key: string]: any;
}

/**
 * Options for recall operations with hierarchy support
 */
export interface RecallOptions extends Partial<Note> {
  includeAncestors?: boolean; // Search parent scopes
  includeDescendants?: boolean; // Search child scopes
  minConfidence?: number; // Filter by confidence threshold
  latestVersionOnly?: boolean; // Only return highest version
}

/**
 * Note hierarchy result structure
 */
export interface NoteHierarchy {
  ancestors: Note[];
  current: Note[];
  descendants: Note[];
}

/**
 * Statistics about notes for an owner
 */
export interface NoteStats {
  totalNotes: number;
  scopeCount: number;
  avgConfidence: number;
  oldestNote: Date;
  newestNote: Date;
  expiringCount: number;
  lowConfidenceCount: number;
}

/**
 * Discovery strategy structure (for self-learning pattern)
 */
export interface DiscoveryStrategy {
  patterns: string[]; // Regex patterns
  selectors?: string[]; // CSS selectors
  expectedCount: number;
  version: number;
  confidence: number;
}
