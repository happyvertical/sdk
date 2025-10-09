import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { Note } from './note.js';
import { NoteCollection } from './notes.js';
import {
  normalizeUrl,
  generateScopeFromUrl,
  hashPageContent,
  extractDomain,
  buildScope,
  parseScope,
  getParentScope,
  isAncestorScope,
} from './utils.js';

describe('@have/notes', () => {
  const testDbPath = '.test-notes.db';

  beforeEach(() => {
    // Clean up any existing test database
    try {
      rmSync(testDbPath, { force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(() => {
    // Clean up test database
    try {
      rmSync(testDbPath, { force: true });
    } catch {
      // Ignore if cleanup fails
    }
  });

  describe('Note entity', () => {
    it('should create a note with default values', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        key: 'test-key',
        value: JSON.stringify({ test: 'data' }),
      });

      await note.initialize();

      expect(note.ownerId).toBe('test-owner-id');
      expect(note.key).toBe('test-key');
      expect(note.scope).toBe('global');
      expect(note.version).toBe(1);
      expect(note.confidence).toBe(1.0);
      expect(note.successCount).toBe(0);
      expect(note.failureCount).toBe(0);
      expect(note.level).toBe(0);
    });

    it('should record success and increase confidence', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        key: 'test-key',
        value: JSON.stringify({ test: 'data' }),
        confidence: 0.7,
      });

      await note.initialize();

      const initialConfidence = note.confidence;
      note.recordSuccess();

      expect(note.successCount).toBe(1);
      expect(note.confidence).toBeGreaterThan(initialConfidence);
      expect(note.confidence).toBeLessThanOrEqual(1.0);
      expect(note.lastUsed).toBeDefined();
    });

    it('should record failure and decrease confidence', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        key: 'test-key',
        value: JSON.stringify({ test: 'data' }),
        confidence: 0.8,
      });

      await note.initialize();

      const initialConfidence = note.confidence;
      note.recordFailure();

      expect(note.failureCount).toBe(1);
      expect(note.confidence).toBeLessThan(initialConfidence);
      expect(note.confidence).toBeGreaterThanOrEqual(0.0);
      expect(note.lastUsed).toBeDefined();
    });

    it('should apply time decay to confidence', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        key: 'test-key',
        value: JSON.stringify({ test: 'data' }),
        confidence: 1.0,
      });

      await note.initialize();

      // Set lastUsed to 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      note.lastUsed = thirtyDaysAgo;

      note.applyTimeDecay(0.05);

      expect(note.confidence).toBeLessThan(1.0);
    });

    it('should calculate health score correctly', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        key: 'test-key',
        value: JSON.stringify({ test: 'data' }),
      });

      await note.initialize();

      // No usage yet
      expect(note.getHealthScore()).toBeNull();

      // Add some successes and failures
      note.successCount = 7;
      note.failureCount = 3;

      expect(note.getHealthScore()).toBe(0.7);
    });

    it('should persist and load from database', async () => {
      const note = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        ownerId: 'test-owner-id',
        scope: 'discovery/parser',
        key: 'test-url',
        value: JSON.stringify({ patterns: ['regex1', 'regex2'] }),
        metadata: JSON.stringify({ aiProvider: 'openai' }),
        confidence: 0.9,
      });

      await note.initialize();
      await note.save();

      // Load it back
      const loaded = new Note({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
        id: note.id,
      });

      await loaded.initialize();

      expect(loaded.ownerId).toBe('test-owner-id');
      expect(loaded.scope).toBe('discovery/parser');
      expect(loaded.key).toBe('test-url');
      expect(loaded.confidence).toBe(0.9);
    });
  });

  describe('NoteCollection', () => {
    it('should create and store a note', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      const note = await collection.note({
        ownerId: 'test-owner',
        scope: 'test/scope',
        key: 'test-key',
        value: JSON.stringify({ data: 'value' }),
      });

      expect(note.ownerId).toBe('test-owner');
      expect(note.scope).toBe('test/scope');
      expect(note.key).toBe('test-key');
      expect(note.id).toBeDefined();
    });

    it('should recall a note by key', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store a note
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test/scope',
        key: 'test-key',
        value: JSON.stringify({ patterns: ['regex1'] }),
      });

      // Recall it
      const value = await collection.recall({
        ownerId: 'test-owner',
        scope: 'test/scope',
        key: 'test-key',
      });

      expect(value).toEqual({ patterns: ['regex1'] });
    });

    it('should recall with hierarchical fallback', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store notes at different levels
      await collection.note({
        ownerId: 'test-owner',
        scope: 'discovery',
        key: 'test-key',
        value: JSON.stringify({ level: 'root' }),
        confidence: 0.6,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'discovery/parser',
        key: 'test-key',
        value: JSON.stringify({ level: 'parser' }),
        confidence: 0.8,
      });

      // Recall from deep scope should return closest match
      const value = await collection.recall({
        ownerId: 'test-owner',
        scope: 'discovery/parser/example.com',
        key: 'test-key',
        includeAncestors: true,
      });

      expect(value).toEqual({ level: 'parser' });
    });

    it('should filter by minimum confidence', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store notes with different confidence levels
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'low-confidence',
        value: JSON.stringify({ confidence: 'low' }),
        confidence: 0.3,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'high-confidence',
        value: JSON.stringify({ confidence: 'high' }),
        confidence: 0.9,
      });

      // Should not find low confidence note
      const lowValue = await collection.recall({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'low-confidence',
        minConfidence: 0.5,
      });

      expect(lowValue).toBeNull();

      // Should find high confidence note
      const highValue = await collection.recall({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'high-confidence',
        minConfidence: 0.5,
      });

      expect(highValue).toEqual({ confidence: 'high' });
    });

    it('should recall all notes in a scope', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store multiple notes
      await collection.note({
        ownerId: 'test-owner',
        scope: 'discovery/parser',
        key: 'url1',
        value: JSON.stringify({ pattern: 'regex1' }),
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'discovery/parser',
        key: 'url2',
        value: JSON.stringify({ pattern: 'regex2' }),
      });

      const allNotes = await collection.recallAll({
        ownerId: 'test-owner',
        scope: 'discovery/parser',
      });

      expect(allNotes.size).toBe(2);
      expect(allNotes.get('url1')).toEqual({ pattern: 'regex1' });
      expect(allNotes.get('url2')).toEqual({ pattern: 'regex2' });
    });

    it('should manage note versions correctly', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store version 1
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'versioned-key',
        value: JSON.stringify({ version: 1 }),
        version: 1,
      });

      // Store version 2
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'versioned-key',
        value: JSON.stringify({ version: 2 }),
        version: 2,
      });

      // Get latest version
      const latest = await collection.getLatestVersion(
        'test-owner',
        'test',
        'versioned-key'
      );

      expect(latest?.version).toBe(2);
      expect(JSON.parse(latest?.value || '{}')).toEqual({ version: 2 });

      // Get all versions
      const allVersions = await collection.getAllVersions(
        'test-owner',
        'test',
        'versioned-key'
      );

      expect(allVersions.length).toBe(2);
    });

    it('should forget a specific note', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store a note
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'to-delete',
        value: JSON.stringify({ data: 'value' }),
      });

      // Verify it exists
      let value = await collection.recall({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'to-delete',
      });
      expect(value).toEqual({ data: 'value' });

      // Delete it
      await collection.forget({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'to-delete',
      });

      // Verify it's gone
      value = await collection.recall({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'to-delete',
      });
      expect(value).toBeNull();
    });

    it('should forget all notes in a scope', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store multiple notes
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test/scope1',
        key: 'key1',
        value: JSON.stringify({ data: '1' }),
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test/scope1',
        key: 'key2',
        value: JSON.stringify({ data: '2' }),
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test/scope2',
        key: 'key3',
        value: JSON.stringify({ data: '3' }),
      });

      // Delete all in scope1
      const count = await collection.forgetScope({
        ownerId: 'test-owner',
        scope: 'test/scope1',
      });

      expect(count).toBe(2);

      // Verify scope1 notes are gone
      const scope1Notes = await collection.recallAll({
        ownerId: 'test-owner',
        scope: 'test/scope1',
      });
      expect(scope1Notes.size).toBe(0);

      // Verify scope2 notes still exist
      const scope2Notes = await collection.recallAll({
        ownerId: 'test-owner',
        scope: 'test/scope2',
      });
      expect(scope2Notes.size).toBe(1);
    });

    it('should archive low confidence notes', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store notes with different confidence levels
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'low1',
        value: JSON.stringify({ data: 'low1' }),
        confidence: 0.2,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'low2',
        value: JSON.stringify({ data: 'low2' }),
        confidence: 0.25,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'high',
        value: JSON.stringify({ data: 'high' }),
        confidence: 0.8,
      });

      // Archive notes below 0.3 confidence
      const archived = await collection.archiveLowConfidence(0.3);

      expect(archived).toBe(2);

      // Verify low confidence notes are gone
      const notes = await collection.recallAll({
        ownerId: 'test-owner',
        scope: 'test',
      });

      expect(notes.size).toBe(1);
      expect(notes.get('high')).toEqual({ data: 'high' });
    });

    it('should get note statistics', async () => {
      const collection = new NoteCollection({
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await collection.initialize();

      // Store notes with various properties
      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'note1',
        value: JSON.stringify({ data: '1' }),
        confidence: 0.8,
        successCount: 5,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'note2',
        value: JSON.stringify({ data: '2' }),
        confidence: 0.6,
        failureCount: 2,
      });

      await collection.note({
        ownerId: 'test-owner',
        scope: 'test',
        key: 'note3',
        value: JSON.stringify({ data: '3' }),
        confidence: 0.9,
        successCount: 10,
      });

      const stats = await collection.getNoteStats('test-owner');

      expect(stats.totalNotes).toBe(3);
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(stats.scopeCount).toBeGreaterThan(0);
    });
  });

  describe('Utility functions', () => {
    it('should normalize URLs correctly', () => {
      const url1 = 'HTTP://WWW.Example.com/path?utm_source=test&id=123';
      const url2 = 'http://example.com/path?id=123';

      const normalized1 = normalizeUrl(url1);
      const normalized2 = normalizeUrl(url2);

      expect(normalized1).toBe(normalized2);
    });

    it('should generate scope from URL', () => {
      const url = 'https://example.com/articles/post-123';
      const scope = generateScopeFromUrl(url);

      expect(scope).toBe('discovery/parser/example.com/articles');
    });

    it('should hash page content consistently', () => {
      const html = '<html><body>Test content</body></html>';
      const hash1 = hashPageContent(html);
      const hash2 = hashPageContent(html);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should extract domain from URL', () => {
      const url = 'https://www.example.com/path';
      const domain = extractDomain(url);

      expect(domain).toBe('example.com'); // www. removed
    });

    it('should build scope from parts', () => {
      const scope = buildScope('discovery', 'parser', 'example.com');
      expect(scope).toBe('discovery/parser/example.com');
    });

    it('should parse scope into parts', () => {
      const scope = 'discovery/parser/example.com';
      const parts = parseScope(scope);

      expect(parts).toEqual(['discovery', 'parser', 'example.com']);
    });

    it('should get parent scope', () => {
      const scope = 'discovery/parser/example.com';
      const parent = getParentScope(scope);

      expect(parent).toBe('discovery/parser');
    });

    it('should detect ancestor scope correctly', () => {
      const parent = 'discovery/parser';
      const child = 'discovery/parser/example.com';
      const unrelated = 'analysis/summarizer';

      expect(isAncestorScope(parent, child)).toBe(true);
      expect(isAncestorScope(child, parent)).toBe(false);
      expect(isAncestorScope(unrelated, child)).toBe(false);
    });
  });

  describe('Integration with SmrtObject', () => {
    it('should allow any SmrtObject to take notes', async () => {
      // We'll test this by creating a simple SmrtObject and using the note methods
      const { SmrtObject } = await import('@have/smrt');

      class TestObject extends SmrtObject {
        testProperty: string = '';
      }

      const obj = new TestObject({
        name: 'test-object',
        db: {
          type: 'sqlite',
          filename: testDbPath,
        },
      });

      await obj.initialize();
      await obj.save();

      // Take a note
      const note = await obj.note({
        scope: 'test/integration',
        key: 'integration-key',
        value: JSON.stringify({ test: 'integration' }),
      });

      expect(note.ownerId).toBe(obj.id);
      expect(note.scope).toBe('test/integration');

      // Recall the note
      const value = await obj.recall({
        scope: 'test/integration',
        key: 'integration-key',
      });

      expect(value).toEqual({ test: 'integration' });

      // Recall all notes
      const allNotes = await obj.recallAll({
        scope: 'test/integration',
      });

      expect(allNotes.size).toBe(1);

      // Forget the note
      await obj.forget({
        scope: 'test/integration',
        key: 'integration-key',
      });

      const forgottenValue = await obj.recall({
        scope: 'test/integration',
        key: 'integration-key',
      });

      expect(forgottenValue).toBeNull();
    });
  });
});
