/**
 * @have/notes - Hierarchical note-taking system for SMRT objects
 *
 * Provides a universal note-taking capability for any SmrtObject with:
 * - Hierarchical scoping for organized note storage
 * - Confidence tracking and time-based decay
 * - Strategy versioning for self-learning patterns
 * - Parent-child relationships for linked strategies
 *
 * Primary use case: Self-learning discovery where AI-learned regex patterns
 * are cached and reused to minimize AI costs.
 *
 * @example
 * ```typescript
 * import { Note, NoteCollection } from '@have/notes';
 * import { normalizeUrl, generateScopeFromUrl } from '@have/notes/utils';
 *
 * // Any SmrtObject can take notes
 * await myObject.note({
 *   scope: 'discovery/parser',
 *   key: normalizeUrl(url),
 *   value: { patterns: ['regex1', 'regex2'] },
 *   metadata: { confidence: 0.9 }
 * });
 *
 * // Recall with hierarchy
 * const strategy = await myObject.recall({
 *   scope: 'discovery/parser/example.com',
 *   key: normalizedUrl,
 *   includeAncestors: true,
 *   minConfidence: 0.6
 * });
 * ```
 *
 * @module @have/notes
 */

export { Note } from './note.js';
export { NoteCollection } from './notes.js';
export type {
  NoteOptions,
  NoteMetadata,
  RecallOptions,
  NoteHierarchy,
  NoteStats,
  DiscoveryStrategy,
} from './types.js';
export {
  normalizeUrl,
  generateScopeFromUrl,
  applyTimeDecay,
  hashPageContent,
  extractDomain,
  buildScope,
  parseScope,
  getParentScope,
  isAncestorScope,
} from './utils.js';
