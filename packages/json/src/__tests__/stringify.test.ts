/**
 * Tests for JSON stringify functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NativeAdapter } from '../adapters/native.js';
import { JSONFactory, safeStringify, stringify } from '../index.js';

describe('stringify', () => {
  describe('basic stringification', () => {
    it('should stringify simple objects', () => {
      const result = stringify({ key: 'value' });
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('should stringify arrays', () => {
      const result = stringify([1, 2, 3]);
      expect(result).toBe('[1,2,3]');
    });

    it('should stringify nested structures', () => {
      const obj = { outer: { inner: { deep: [1, 2, 3] } } };
      const result = stringify(obj);
      expect(JSON.parse(result)).toEqual(obj);
    });

    it('should stringify primitive types', () => {
      expect(stringify(null)).toBe('null');
      expect(stringify(true)).toBe('true');
      expect(stringify(false)).toBe('false');
      expect(stringify(42)).toBe('42');
      expect(stringify('hello')).toBe('"hello"');
    });

    it('should stringify floating point numbers', () => {
      expect(stringify(3.14)).toBe('3.14');
      expect(stringify(-273.15)).toBe('-273.15');
    });

    it('should stringify empty structures', () => {
      expect(stringify({})).toBe('{}');
      expect(stringify([])).toBe('[]');
    });
  });

  describe('special values', () => {
    it('should convert undefined to null in arrays', () => {
      const result = stringify([1, undefined, 3]);
      expect(result).toBe('[1,null,3]');
    });

    it('should omit undefined values in objects', () => {
      const result = stringify({ a: 1, b: undefined, c: 3 });
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ a: 1, c: 3 });
      expect('b' in parsed).toBe(false);
    });

    it('should omit functions in objects', () => {
      const result = stringify({ a: 1, fn: () => {} });
      expect(JSON.parse(result)).toEqual({ a: 1 });
    });

    it('should convert NaN and Infinity to null', () => {
      expect(stringify(NaN)).toBe('null');
      expect(stringify(Infinity)).toBe('null');
      expect(stringify(-Infinity)).toBe('null');
    });
  });

  describe('unicode and escaping', () => {
    it('should escape special characters', () => {
      const result = stringify({ text: 'line1\nline2\ttab' });
      expect(result).toContain('\\n');
      expect(result).toContain('\\t');
    });

    it('should handle unicode characters', () => {
      const result = stringify({ emoji: '\ud83d\ude00' });
      // Should be valid JSON that can be parsed back
      const parsed = JSON.parse(result);
      expect(parsed.emoji).toBe('\ud83d\ude00');
    });

    it('should escape quotes', () => {
      const result = stringify({ quote: 'He said "hello"' });
      expect(result).toContain('\\"');
    });
  });

  describe('replacer function', () => {
    it('should transform values with replacer function', () => {
      const result = stringify({ a: 1, b: 2 }, (key, value) => {
        if (typeof value === 'number') {
          return value * 2;
        }
        return value;
      });
      expect(JSON.parse(result)).toEqual({ a: 2, b: 4 });
    });

    it('should filter keys with replacer array', () => {
      const result = stringify({ a: 1, b: 2, c: 3 }, ['a', 'c']);
      expect(JSON.parse(result)).toEqual({ a: 1, c: 3 });
    });

    it('should handle null replacer', () => {
      const result = stringify({ a: 1 }, null);
      expect(JSON.parse(result)).toEqual({ a: 1 });
    });
  });

  describe('indentation', () => {
    it('should indent with number of spaces', () => {
      const result = stringify({ a: 1 }, null, 2);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    it('should indent with string', () => {
      const result = stringify({ a: 1 }, null, '\t');
      expect(result).toContain('\n');
      expect(result).toContain('\t');
    });

    it('should limit indentation to 10 characters', () => {
      const result = stringify({ a: 1 }, null, 20);
      // Should use max 10 spaces
      const lines = result.split('\n');
      expect(lines.some((line) => line.startsWith('          '))).toBe(true);
    });

    it('should handle zero indentation', () => {
      const result = stringify({ a: 1 }, null, 0);
      expect(result).not.toContain('\n');
    });
  });

  describe('error handling', () => {
    it('should throw on circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.circular = obj;
      expect(() => stringify(obj)).toThrow();
    });

    it('should throw on BigInt', () => {
      expect(() => stringify(BigInt(123))).toThrow();
    });
  });
});

describe('safeStringify', () => {
  it('should return success for valid values', () => {
    const result = safeStringify({ key: 'value' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(JSON.parse(result.value)).toEqual({ key: 'value' });
    }
  });

  it('should return error for circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.circular = obj;
    const result = safeStringify(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBeTruthy();
    }
  });
});

describe('adapter consistency', () => {
  let nativeAdapter: NativeAdapter;

  beforeEach(() => {
    nativeAdapter = new NativeAdapter();
  });

  it('native adapter should match JSON.stringify behavior', () => {
    const testCases = [
      { nested: { array: [1, 'two', null, true] } },
      [1, 2, 3],
      'string',
      42,
      null,
      true,
    ];

    for (const value of testCases) {
      expect(nativeAdapter.stringify(value)).toBe(JSON.stringify(value));
    }
  });

  it('should handle edge cases consistently', () => {
    const testCases = [
      { '': 'empty key' },
      { large: Number.MAX_SAFE_INTEGER },
      [[[[1]]]],
    ];

    for (const value of testCases) {
      expect(nativeAdapter.stringify(value)).toBe(JSON.stringify(value));
    }
  });
});
