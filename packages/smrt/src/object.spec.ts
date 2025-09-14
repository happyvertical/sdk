/**
 * Tests for BaseObject functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseObject } from './object.js';
import { text, boolean, integer } from './fields/index.js';

// Simple test class extending BaseObject
class TestObject extends BaseObject {
  static tableName = 'test_objects';

  // Don't initialize these - let BaseObject handle them
  declare name: string;
  declare description?: string;
  declare active: boolean;
  declare count: number;
}

describe('BaseObject', () => {
  describe('Basic Instantiation', () => {
    it('should create a new instance with provided values', () => {
      const obj = new TestObject({
        id: 'test-id',
        name: 'Test Object'
      });

      expect(obj).toBeInstanceOf(BaseObject);
      expect(obj).toBeInstanceOf(TestObject);
      expect(obj.name).toBe('Test Object');
      expect(obj.id).toBe('test-id');
    });

    it('should handle missing ID (returns null)', () => {
      const obj = new TestObject({ name: 'No ID Object' });

      expect(obj.name).toBe('No ID Object');
      expect(obj.id).toBeNull();
    });

    it('should accept ID in options', () => {
      const customId = 'custom-test-id';
      const obj = new TestObject({ id: customId, name: 'Test' });

      expect(obj.id).toBe(customId);
    });
  });

  describe('Static Properties', () => {
    it('should have proper table name', () => {
      expect(TestObject.tableName).toBe('test_objects');
    });
  });

  describe('Instance Properties', () => {
    let testObj: TestObject;

    beforeEach(() => {
      testObj = new TestObject({
        id: 'test-instance-id',
        name: 'Test Instance'
      });
    });

    it('should have proper property access', () => {
      expect(testObj.id).toBe('test-instance-id');
      expect(testObj.name).toBe('Test Instance');
    });

    it('should have timestamp properties', () => {
      expect(testObj).toHaveProperty('created_at');
      expect(testObj).toHaveProperty('updated_at');
    });
  });

  describe('Property Assignment', () => {
    it('should allow property updates', () => {
      const obj = new TestObject({
        id: 'test-id',
        name: 'Initial'
      });

      obj.name = 'Updated';
      obj.description = 'Added description';
      obj.count = 5;

      expect(obj.name).toBe('Updated');
      expect(obj.description).toBe('Added description');
      expect(obj.count).toBe(5);
    });
  });
});