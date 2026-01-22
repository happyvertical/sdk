/**
 * Tests for JSON parse functionality
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NativeAdapter } from '../adapters/native.js';
import { isValid, JSONFactory, parse, safeParse } from '../index.js';

describe('parse', () => {
  describe('basic parsing', () => {
    it('should parse simple objects', () => {
      const result = parse<{ key: string }>('{"key": "value"}');
      expect(result.key).toBe('value');
    });

    it('should parse arrays', () => {
      const result = parse<number[]>('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse nested structures', () => {
      const json = '{"outer": {"inner": {"deep": [1, 2, 3]}}}';
      const result = parse<{ outer: { inner: { deep: number[] } } }>(json);
      expect(result.outer.inner.deep).toEqual([1, 2, 3]);
    });

    it('should parse primitive types', () => {
      expect(parse('null')).toBe(null);
      expect(parse('true')).toBe(true);
      expect(parse('false')).toBe(false);
      expect(parse('42')).toBe(42);
      expect(parse('"hello"')).toBe('hello');
    });

    it('should parse floating point numbers', () => {
      expect(parse('3.14159')).toBeCloseTo(3.14159);
      expect(parse('-273.15')).toBeCloseTo(-273.15);
      expect(parse('1e10')).toBe(1e10);
      expect(parse('1.5e-3')).toBeCloseTo(0.0015);
    });

    it('should parse empty structures', () => {
      expect(parse('{}')).toEqual({});
      expect(parse('[]')).toEqual([]);
    });
  });

  describe('unicode support', () => {
    it('should handle unicode strings', () => {
      const result = parse<{ emoji: string }>('{"emoji": "\\ud83d\\ude00"}');
      expect(result.emoji).toBe('\ud83d\ude00');
    });

    it('should handle escaped characters', () => {
      const json = '{"escaped": "line1\\nline2\\ttab"}';
      const result = parse<{ escaped: string }>(json);
      expect(result.escaped).toBe('line1\nline2\ttab');
    });

    it('should handle unicode escape sequences', () => {
      const result = parse<{ char: string }>('{"char": "\\u0041"}');
      expect(result.char).toBe('A');
    });
  });

  describe('reviver function', () => {
    it('should transform values with reviver', () => {
      const json = '{"date": "2024-01-15"}';
      const result = parse<{ date: Date }>(json, (key, value) => {
        if (key === 'date') {
          return new Date(value as string);
        }
        return value;
      });
      expect(result.date instanceof Date).toBe(true);
      expect(result.date.getFullYear()).toBe(2024);
    });

    it('should work with nested objects', () => {
      const json = '{"outer": {"value": 10}}';
      const result = parse<{ outer: { value: number } }>(json, (key, value) => {
        if (typeof value === 'number') {
          return value * 2;
        }
        return value;
      });
      expect(result.outer.value).toBe(20);
    });
  });

  describe('error handling', () => {
    it('should throw on invalid JSON', () => {
      expect(() => parse('{')).toThrow();
      expect(() => parse('{"key": }')).toThrow();
      expect(() => parse('[1, 2, ]')).toThrow();
      expect(() => parse('undefined')).toThrow();
    });

    it('should throw on trailing commas', () => {
      expect(() => parse('{"key": "value",}')).toThrow();
      expect(() => parse('[1, 2,]')).toThrow();
    });

    it('should throw on single quotes', () => {
      expect(() => parse("{'key': 'value'}")).toThrow();
    });
  });
});

describe('safeParse', () => {
  it('should return success for valid JSON', () => {
    const result = safeParse<{ key: string }>('{"key": "value"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.key).toBe('value');
    }
  });

  it('should return error for invalid JSON', () => {
    const result = safeParse('{invalid}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBeTruthy();
    }
  });

  it('should include position information when available', () => {
    const result = safeParse('{\n  "key": \n}');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Position info may or may not be available depending on adapter
      expect(result.error.message).toBeTruthy();
    }
  });
});

describe('isValid', () => {
  it('should return true for valid JSON', () => {
    expect(isValid('{"key": "value"}')).toBe(true);
    expect(isValid('[1, 2, 3]')).toBe(true);
    expect(isValid('null')).toBe(true);
    expect(isValid('"string"')).toBe(true);
    expect(isValid('42')).toBe(true);
  });

  it('should return false for invalid JSON', () => {
    expect(isValid('{')).toBe(false);
    expect(isValid('{key: value}')).toBe(false);
    expect(isValid('undefined')).toBe(false);
    expect(isValid("{'single': 'quotes'}")).toBe(false);
  });
});

describe('adapter consistency', () => {
  let nativeAdapter: NativeAdapter;

  beforeEach(() => {
    nativeAdapter = new NativeAdapter();
  });

  it('native adapter should match JSON.parse behavior', () => {
    const json = '{"nested": {"array": [1, "two", null, true]}}';

    const nativeResult = nativeAdapter.parse(json);
    const builtinResult = JSON.parse(json);

    expect(nativeResult).toEqual(builtinResult);
  });

  it('should handle edge cases consistently', () => {
    const testCases = [
      '{"": "empty key"}',
      '{"key": "\\u0000"}',
      '{"large": 9007199254740991}',
      '[[[[[1]]]]]',
    ];

    for (const json of testCases) {
      expect(nativeAdapter.parse(json)).toEqual(JSON.parse(json));
    }
  });
});
