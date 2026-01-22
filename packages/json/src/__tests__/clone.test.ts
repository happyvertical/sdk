/**
 * Tests for JSON clone functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NativeAdapter } from '../adapters/native.js';
import { clone, JSONFactory } from '../index.js';

describe('clone', () => {
  describe('basic cloning', () => {
    it('should create a deep copy of objects', () => {
      const original = { a: 1, b: { c: 2 } };
      const copy = clone(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.b).not.toBe(original.b);
    });

    it('should create a deep copy of arrays', () => {
      const original = [1, [2, [3]]];
      const copy = clone(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy[1]).not.toBe(original[1]);
    });

    it('should handle primitive values', () => {
      expect(clone(null)).toBe(null);
      expect(clone(true)).toBe(true);
      expect(clone(false)).toBe(false);
      expect(clone(42)).toBe(42);
      expect(clone('hello')).toBe('hello');
    });
  });

  describe('independence of copy', () => {
    it('should create independent nested objects', () => {
      const original = { nested: { deep: { value: 1 } } };
      const copy = clone(original);

      copy.nested.deep.value = 999;

      expect(original.nested.deep.value).toBe(1);
      expect(copy.nested.deep.value).toBe(999);
    });

    it('should create independent arrays', () => {
      const original = { items: [1, 2, 3] };
      const copy = clone(original);

      copy.items.push(4);

      expect(original.items).toEqual([1, 2, 3]);
      expect(copy.items).toEqual([1, 2, 3, 4]);
    });

    it('should create independent nested arrays', () => {
      const original = [
        [1, 2],
        [3, 4],
      ];
      const copy = clone(original);

      copy[0].push(999);

      expect(original[0]).toEqual([1, 2]);
      expect(copy[0]).toEqual([1, 2, 999]);
    });
  });

  describe('JSON serialization rules', () => {
    it('should convert undefined to null in arrays', () => {
      const original = [1, undefined, 3];
      const copy = clone(original);
      expect(copy).toEqual([1, null, 3]);
    });

    it('should omit undefined values in objects', () => {
      const original = { a: 1, b: undefined, c: 3 };
      const copy = clone(original);
      expect(copy).toEqual({ a: 1, c: 3 });
      expect('b' in copy).toBe(false);
    });

    it('should omit functions', () => {
      const original = { a: 1, fn: () => 'hello' };
      const copy = clone(original);
      expect(copy).toEqual({ a: 1 });
    });

    it('should convert Date to string', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const original = { date };
      const copy = clone(original);
      expect(typeof copy.date).toBe('string');
      expect(copy.date).toBe(date.toISOString());
    });

    it('should convert NaN and Infinity to null', () => {
      const original = { nan: NaN, inf: Infinity, negInf: -Infinity };
      const copy = clone(original);
      expect(copy).toEqual({ nan: null, inf: null, negInf: null });
    });
  });

  describe('complex structures', () => {
    it('should handle deeply nested structures', () => {
      const original = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };
      const copy = clone(original);

      expect(copy).toEqual(original);
      copy.level1.level2.level3.level4.value = 'modified';
      expect(original.level1.level2.level3.level4.value).toBe('deep');
    });

    it('should handle mixed arrays and objects', () => {
      const original = {
        items: [
          { id: 1, tags: ['a', 'b'] },
          { id: 2, tags: ['c', 'd'] },
        ],
      };
      const copy = clone(original);

      expect(copy).toEqual(original);
      copy.items[0].tags.push('new');
      expect(original.items[0].tags).toEqual(['a', 'b']);
    });

    it('should handle large arrays', () => {
      const original = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        value: `item-${i}`,
      }));
      const copy = clone(original);

      expect(copy.length).toBe(original.length);
      expect(copy[0]).toEqual(original[0]);
      expect(copy[9999]).toEqual(original[9999]);
      expect(copy[5000]).not.toBe(original[5000]);
    });
  });

  describe('error handling', () => {
    it('should throw on circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.circular = obj;
      expect(() => clone(obj)).toThrow();
    });

    it('should throw on BigInt', () => {
      expect(() => clone({ big: BigInt(123) })).toThrow();
    });
  });
});

describe('adapter consistency', () => {
  let nativeAdapter: NativeAdapter;

  beforeEach(() => {
    nativeAdapter = new NativeAdapter();
  });

  it('native adapter clone should match JSON round-trip', () => {
    const testCases = [
      { nested: { array: [1, 'two', null, true] } },
      [1, 2, 3],
      { date: new Date().toISOString() },
      { empty: {} },
    ];

    for (const original of testCases) {
      const adapterClone = nativeAdapter.clone(original);
      const jsonClone = JSON.parse(JSON.stringify(original));
      expect(adapterClone).toEqual(jsonClone);
    }
  });
});
