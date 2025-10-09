/**
 * NoteCollection - Collection manager for Note objects
 *
 * Provides hierarchy traversal, versioning, confidence tracking,
 * and strategy-aware operations for self-learning discovery patterns.
 */

import { SmrtCollection } from '@have/smrt';
import { Note } from './note.js';
import type { NoteHierarchy, NoteStats, RecallOptions } from './types.js';
import { getParentScope, isAncestorScope } from './utils.js';

export class NoteCollection extends SmrtCollection<Note> {
  static readonly _itemClass = Note;

  /**
   * Store a note
   * Automatically handles JSON serialization of value and metadata
   *
   * @param options - Note properties
   * @returns Created Note instance
   */
  async note(options: Partial<Note>): Promise<Note> {
    const note = new Note();

    // Set all provided properties
    Object.assign(note, options);

    // Handle value serialization
    if (options.value && typeof options.value === 'object') {
      note.setValue(options.value);
    }

    // Handle metadata serialization
    if (options.metadata && typeof options.metadata === 'object') {
      note.setMetadata(options.metadata);
    }

    // Set timestamps
    note.createdAt = new Date();
    note.updatedAt = new Date();

    // Initialize lastUsed if not provided
    if (!note.lastUsed) {
      note.lastUsed = new Date();
    }

    return (await this.create(note)) as Note;
  }

  /**
   * Recall a note with hierarchical fallback and confidence filtering
   *
   * @param options - Query options with hierarchy support
   * @returns Note value or null if not found
   */
  async recall(
    options: Partial<Note> & Omit<RecallOptions, keyof Note>,
  ): Promise<any | null> {
    const {
      includeAncestors,
      includeDescendants,
      minConfidence,
      latestVersionOnly,
      ...noteProps
    } = options;

    // Build query
    const where: any = { ...noteProps };

    // Apply confidence filter if specified
    if (minConfidence !== undefined) {
      // We'll filter in-memory since SQL comparison on confidence field
      // This could be optimized with a custom query later
    }

    // Get matching notes
    let notes = (await this.list({ where })) as Note[];

    // Filter by confidence if specified
    if (minConfidence !== undefined) {
      notes = notes.filter((note) => note.confidence >= minConfidence);
    }

    // Filter to latest version only if specified
    if (latestVersionOnly) {
      notes = this.filterLatestVersions(notes);
    }

    // If we found notes, return the best one
    if (notes.length > 0) {
      // Sort by confidence (highest first)
      notes.sort((a, b) => b.confidence - a.confidence);
      return notes[0].getValue();
    }

    // If includeAncestors, try parent scopes
    if (includeAncestors && noteProps.scope) {
      let currentScope: string | null = noteProps.scope;

      while (currentScope) {
        currentScope = getParentScope(currentScope);
        if (!currentScope) break;

        const ancestorNotes = await this.recall({
          ...noteProps,
          scope: currentScope,
          minConfidence,
          latestVersionOnly,
          includeAncestors: false, // Don't recurse indefinitely
        });

        if (ancestorNotes) return ancestorNotes;
      }
    }

    // If includeDescendants, search child scopes
    if (includeDescendants && noteProps.scope) {
      const allNotes = (await this.list({
        where: { ownerId: noteProps.ownerId },
      })) as Note[];

      const descendantNotes = allNotes.filter(
        (note) =>
          noteProps.scope && isAncestorScope(noteProps.scope, note.scope),
      );

      // Apply other filters
      let filtered = descendantNotes;

      if (noteProps.key) {
        filtered = filtered.filter((note) => note.key === noteProps.key);
      }

      if (minConfidence !== undefined) {
        filtered = filtered.filter((note) => note.confidence >= minConfidence);
      }

      if (latestVersionOnly) {
        filtered = this.filterLatestVersions(filtered);
      }

      if (filtered.length > 0) {
        // Return highest confidence
        filtered.sort((a, b) => b.confidence - a.confidence);
        return filtered[0].getValue();
      }
    }

    return null;
  }

  /**
   * Recall all notes matching criteria
   *
   * @param options - Query options with hierarchy support
   * @returns Map of key -> value for all matching notes
   */
  async recallAll(
    options: Partial<Note> & Omit<RecallOptions, keyof Note> = {},
  ): Promise<Map<string, any>> {
    const {
      includeAncestors,
      includeDescendants,
      minConfidence,
      latestVersionOnly,
      ...noteProps
    } = options;

    const results = new Map<string, any>();
    const where: any = { ...noteProps };

    let notes = (await this.list({ where })) as Note[];

    // Apply confidence filter
    if (minConfidence !== undefined) {
      notes = notes.filter((note) => note.confidence >= minConfidence);
    }

    // Filter to latest versions
    if (latestVersionOnly) {
      notes = this.filterLatestVersions(notes);
    }

    // Add notes to results
    for (const note of notes) {
      results.set(note.key, note.getValue());
    }

    // Include descendants if requested
    if (includeDescendants && noteProps.scope) {
      const allNotes = (await this.list({
        where: { ownerId: noteProps.ownerId },
      })) as Note[];

      const descendantNotes = allNotes.filter(
        (note) =>
          noteProps.scope && isAncestorScope(noteProps.scope, note.scope),
      );

      let filtered = descendantNotes;

      if (minConfidence !== undefined) {
        filtered = filtered.filter((note) => note.confidence >= minConfidence);
      }

      if (latestVersionOnly) {
        filtered = this.filterLatestVersions(filtered);
      }

      for (const note of filtered) {
        results.set(note.key, note.getValue());
      }
    }

    return results;
  }

  /**
   * Forget (delete) a specific note
   *
   * @param options - Note identification properties
   */
  async forget(options: Partial<Note>): Promise<void> {
    const notes = (await this.list({ where: options })) as Note[];

    for (const note of notes) {
      await note.delete();
    }
  }

  /**
   * Clear all notes matching criteria
   *
   * @param options - Query options
   * @returns Number of notes deleted
   */
  async forgetScope(
    options: Partial<Note> & { includeDescendants?: boolean } = {},
  ): Promise<number> {
    const { includeDescendants, ...noteProps } = options;
    let count = 0;

    // Delete notes matching directly
    const notes = (await this.list({ where: noteProps })) as Note[];
    for (const note of notes) {
      await note.delete();
      count++;
    }

    // Delete descendants if requested
    if (includeDescendants && noteProps.scope) {
      const allNotes = (await this.list({
        where: { ownerId: noteProps.ownerId },
      })) as Note[];

      const descendantNotes = allNotes.filter(
        (note) =>
          noteProps.scope && isAncestorScope(noteProps.scope, note.scope),
      );

      for (const note of descendantNotes) {
        await note.delete();
        count++;
      }
    }

    return count;
  }

  /**
   * Get latest version of a note by ownerId, scope, and key
   *
   * @param ownerId - Owner ID
   * @param scope - Note scope
   * @param key - Note key
   * @returns Latest version Note or null
   */
  async getLatestVersion(
    ownerId: string,
    scope: string,
    key: string,
  ): Promise<Note | null> {
    const notes = (await this.list({
      where: { ownerId, scope, key },
    })) as Note[];

    if (notes.length === 0) return null;

    // Sort by version descending
    notes.sort((a, b) => b.version - a.version);
    return notes[0];
  }

  /**
   * Get all versions of a note
   *
   * @param ownerId - Owner ID
   * @param scope - Note scope
   * @param key - Note key
   * @returns Array of all versions, sorted by version number
   */
  async getAllVersions(
    ownerId: string,
    scope: string,
    key: string,
  ): Promise<Note[]> {
    const notes = (await this.list({
      where: { ownerId, scope, key },
    })) as Note[];

    // Sort by version ascending
    notes.sort((a, b) => a.version - b.version);
    return notes;
  }

  /**
   * Find sibling strategies (notes with same parentId)
   * Useful for finding similar parsing strategies
   *
   * @param noteId - Note ID to find siblings for
   * @returns Array of sibling notes
   */
  async findSiblingStrategies(noteId: string): Promise<Note[]> {
    const note = (await this.get({ id: noteId })) as Note | null;
    if (!note || !note.parentId) return [];

    return (await this.list({
      where: { parentId: note.parentId },
    })) as Note[];
  }

  /**
   * Invalidate all child notes (cascade confidence penalty)
   * Useful when a parent strategy fails
   *
   * @param noteId - Parent note ID
   * @returns Number of children invalidated
   */
  async invalidateChildren(noteId: string): Promise<number> {
    const children = (await this.list({
      where: { parentId: noteId },
    })) as Note[];

    for (const child of children) {
      child.confidence *= 0.5; // Significant penalty
      await child.save();
    }

    return children.length;
  }

  /**
   * Get notes in a specific scope
   *
   * @param ownerId - Owner ID
   * @param scope - Scope path
   * @param includeDescendants - Include child scopes
   * @returns Array of notes
   */
  async getNotesInScope(
    ownerId: string,
    scope: string,
    includeDescendants = false,
  ): Promise<Note[]> {
    if (!includeDescendants) {
      return (await this.list({ where: { ownerId, scope } })) as Note[];
    }

    const allNotes = (await this.list({ where: { ownerId } })) as Note[];

    return allNotes.filter(
      (note) => note.scope === scope || isAncestorScope(scope, note.scope),
    );
  }

  /**
   * Get scope hierarchy (ancestors, current, descendants)
   *
   * @param ownerId - Owner ID
   * @param scope - Scope path
   * @returns Hierarchy structure
   */
  async getScopeHierarchy(
    ownerId: string,
    scope: string,
  ): Promise<NoteHierarchy> {
    const allNotes = (await this.list({ where: { ownerId } })) as Note[];

    const current = allNotes.filter((note) => note.scope === scope);

    const ancestors = allNotes.filter((note) =>
      isAncestorScope(note.scope, scope),
    );

    const descendants = allNotes.filter((note) =>
      isAncestorScope(scope, note.scope),
    );

    return { ancestors, current, descendants };
  }

  /**
   * Get children of a specific note (via parentId)
   *
   * @param noteId - Parent note ID
   * @returns Array of child notes
   */
  async getChildren(noteId: string): Promise<Note[]> {
    return (await this.list({ where: { parentId: noteId } })) as Note[];
  }

  /**
   * Get parent of a specific note
   *
   * @param noteId - Child note ID
   * @returns Parent note or null
   */
  async getParent(noteId: string): Promise<Note | null> {
    const note = (await this.get({ id: noteId })) as Note | null;
    if (!note || !note.parentId) return null;

    return (await this.get({ id: note.parentId })) as Note | null;
  }

  /**
   * Get all ancestor notes (recursive via parentId)
   *
   * @param noteId - Starting note ID
   * @returns Array of ancestors from root to immediate parent
   */
  async getAncestors(noteId: string): Promise<Note[]> {
    const ancestors: Note[] = [];
    let current = (await this.get({ id: noteId })) as Note | null;

    while (current?.parentId) {
      const parent = (await this.get({ id: current.parentId })) as Note | null;
      if (!parent) break;
      ancestors.unshift(parent); // Add to beginning
      current = parent;
    }

    return ancestors;
  }

  /**
   * Get all descendant notes (recursive via parentId)
   *
   * @param noteId - Starting note ID
   * @returns Array of all descendants
   */
  async getDescendants(noteId: string): Promise<Note[]> {
    const children = await this.getChildren(noteId);
    const descendants: Note[] = [...children];

    for (const child of children) {
      const childDescendants = await this.getDescendants(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Cleanup expired notes
   *
   * @returns Number of notes deleted
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const allNotes = (await this.list({})) as Note[];

    let count = 0;
    for (const note of allNotes) {
      if (note.expiresAt && note.expiresAt < now) {
        await note.delete();
        count++;
      }
    }

    return count;
  }

  /**
   * Archive or delete low confidence, unused strategies
   *
   * @param threshold - Confidence threshold (default: 0.3)
   * @returns Number of notes archived/deleted
   */
  async archiveLowConfidence(threshold = 0.3): Promise<number> {
    const allNotes = (await this.list({})) as Note[];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let count = 0;
    for (const note of allNotes) {
      if (
        note.confidence < threshold &&
        note.lastUsed &&
        note.lastUsed < thirtyDaysAgo
      ) {
        await note.delete();
        count++;
      }
    }

    return count;
  }

  /**
   * Get statistics about notes for an owner
   *
   * @param ownerId - Owner ID
   * @returns Statistics object
   */
  async getNoteStats(ownerId: string): Promise<NoteStats> {
    const notes = (await this.list({ where: { ownerId } })) as Note[];

    if (notes.length === 0) {
      return {
        totalNotes: 0,
        scopeCount: 0,
        avgConfidence: 0,
        oldestNote: new Date(),
        newestNote: new Date(),
        expiringCount: 0,
        lowConfidenceCount: 0,
      };
    }

    const scopes = new Set(notes.map((n) => n.scope));
    const avgConfidence =
      notes.reduce((sum, n) => sum + n.confidence, 0) / notes.length;

    const oldest = notes.reduce(
      (min, n) => (n.createdAt < min ? n.createdAt : min),
      notes[0].createdAt,
    );
    const newest = notes.reduce(
      (max, n) => (n.createdAt > max ? n.createdAt : max),
      notes[0].createdAt,
    );

    const now = new Date();
    const expiringCount = notes.filter(
      (n) => n.expiresAt && n.expiresAt > now,
    ).length;

    const lowConfidenceCount = notes.filter((n) => n.confidence < 0.5).length;

    return {
      totalNotes: notes.length,
      scopeCount: scopes.size,
      avgConfidence,
      oldestNote: oldest,
      newestNote: newest,
      expiringCount,
      lowConfidenceCount,
    };
  }

  /**
   * Filter notes to only latest versions
   * Groups by (scope, key) and keeps highest version
   *
   * @param notes - Array of notes to filter
   * @returns Filtered array with only latest versions
   */
  private filterLatestVersions(notes: Note[]): Note[] {
    const grouped = new Map<string, Note[]>();

    // Group by scope + key
    for (const note of notes) {
      const groupKey = `${note.scope}:${note.key}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(note);
    }

    // Keep only highest version from each group
    const latest: Note[] = [];
    for (const group of grouped.values()) {
      group.sort((a, b) => b.version - a.version);
      latest.push(group[0]);
    }

    return latest;
  }
}
