/**
 * Tests for JSONFactory and adapter selection
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NativeAdapter } from '../adapters/native.js';
import { isSonicAvailable } from '../adapters/sonic.js';
import {
  createAdapter,
  getAdapterInfo,
  getDefaultAdapter,
  isSIMDAvailable,
  JSONFactory,
} from '../index.js';

describe('JSONFactory', () => {
  afterEach(() => {
    // Reset default adapter between tests
    JSONFactory.resetDefault();
  });

  describe('create', () => {
    it('should create native adapter when requested', () => {
      const adapter = JSONFactory.create({ adapter: 'native' });
      expect(adapter.name).toBe('native');
      expect(adapter.isNative).toBe(true);
    });

    it('should create adapter with auto mode', () => {
      const adapter = JSONFactory.create({ adapter: 'auto' });
      // Should be either sonic or native depending on platform
      expect(['sonic', 'native']).toContain(adapter.name);
    });

    it('should create adapter with default options', () => {
      const adapter = JSONFactory.create();
      expect(['sonic', 'native']).toContain(adapter.name);
    });

    it('should respect fallback option for sonic', () => {
      // If sonic is available, this should succeed
      // If not, and fallback is true, should fall back to native
      const adapter = JSONFactory.create({ adapter: 'sonic', fallback: true });
      expect(['sonic', 'native']).toContain(adapter.name);
    });

    it('should throw when sonic unavailable and fallback is false', () => {
      // Only test this if sonic is actually unavailable
      if (!isSonicAvailable()) {
        expect(() =>
          JSONFactory.create({ adapter: 'sonic', fallback: false }),
        ).toThrow();
      }
    });

    it('should treat simd as alias for sonic', () => {
      const adapter = JSONFactory.create({ adapter: 'simd', fallback: true });
      expect(['sonic', 'native']).toContain(adapter.name);
    });

    it('should throw on unknown adapter type', () => {
      expect(() => JSONFactory.create({ adapter: 'unknown' as any })).toThrow(
        'Unknown adapter type',
      );
    });
  });

  describe('getDefault', () => {
    it('should return cached adapter on subsequent calls', () => {
      const first = JSONFactory.getDefault();
      const second = JSONFactory.getDefault();
      expect(first).toBe(second);
    });

    it('should use auto mode for default adapter', () => {
      const adapter = JSONFactory.getDefault();
      expect(['sonic', 'native']).toContain(adapter.name);
    });
  });

  describe('isAvailable', () => {
    it('should return true for native adapter', () => {
      expect(JSONFactory.isAvailable('native')).toBe(true);
    });

    it('should return true for auto', () => {
      expect(JSONFactory.isAvailable('auto')).toBe(true);
    });

    it('should return correct availability for sonic', () => {
      expect(JSONFactory.isAvailable('sonic')).toBe(isSonicAvailable());
    });

    it('should return correct availability for simd', () => {
      expect(JSONFactory.isAvailable('simd')).toBe(isSonicAvailable());
    });

    it('should return false for unknown adapter', () => {
      expect(JSONFactory.isAvailable('unknown' as any)).toBe(false);
    });
  });

  describe('getAdapterName', () => {
    it('should return native for native option', () => {
      expect(JSONFactory.getAdapterName({ adapter: 'native' })).toBe('native');
    });

    it('should return appropriate name for auto', () => {
      const name = JSONFactory.getAdapterName({ adapter: 'auto' });
      expect(['sonic', 'native']).toContain(name);
    });

    it('should return appropriate name for default', () => {
      const name = JSONFactory.getAdapterName();
      expect(['sonic', 'native']).toContain(name);
    });
  });
});

describe('convenience functions', () => {
  afterEach(() => {
    JSONFactory.resetDefault();
  });

  describe('getDefaultAdapter', () => {
    it('should return the default adapter', () => {
      const adapter = getDefaultAdapter();
      expect(adapter).toBeDefined();
      expect(['sonic', 'native']).toContain(adapter.name);
    });
  });

  describe('createAdapter', () => {
    it('should create an adapter with options', () => {
      const adapter = createAdapter({ adapter: 'native' });
      expect(adapter.name).toBe('native');
    });

    it('should create an adapter with defaults', () => {
      const adapter = createAdapter();
      expect(['sonic', 'native']).toContain(adapter.name);
    });
  });

  describe('getAdapterInfo', () => {
    it('should return adapter information', () => {
      const info = getAdapterInfo();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('isNative');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('simdEnabled');
    });
  });

  describe('isSIMDAvailable', () => {
    it('should return boolean', () => {
      const available = isSIMDAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should match adapter isNative property', () => {
      const adapter = getDefaultAdapter();
      expect(isSIMDAvailable()).toBe(!adapter.isNative);
    });
  });
});

describe('NativeAdapter', () => {
  let adapter: NativeAdapter;

  beforeEach(() => {
    adapter = new NativeAdapter();
  });

  it('should have correct name', () => {
    expect(adapter.name).toBe('native');
  });

  it('should be marked as native', () => {
    expect(adapter.isNative).toBe(true);
  });

  it('should provide adapter info', () => {
    const info = adapter.getInfo();
    expect(info.name).toBe('native');
    expect(info.isNative).toBe(true);
    expect(info.simdEnabled).toBe(false);
    expect(typeof info.version).toBe('string');
  });

  describe('parse', () => {
    it('should parse JSON correctly', () => {
      expect(adapter.parse('{"key": "value"}')).toEqual({ key: 'value' });
    });
  });

  describe('stringify', () => {
    it('should stringify correctly', () => {
      expect(adapter.stringify({ key: 'value' })).toBe('{"key":"value"}');
    });
  });

  describe('clone', () => {
    it('should deep clone correctly', () => {
      const original = { nested: { value: 1 } };
      const copy = adapter.clone(original);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.nested).not.toBe(original.nested);
    });
  });

  describe('safeParse', () => {
    it('should return success for valid JSON', () => {
      const result = adapter.safeParse('{"valid": true}');
      expect(result.success).toBe(true);
    });

    it('should return error for invalid JSON', () => {
      const result = adapter.safeParse('{invalid}');
      expect(result.success).toBe(false);
    });
  });

  describe('safeStringify', () => {
    it('should return success for valid values', () => {
      const result = adapter.safeStringify({ valid: true });
      expect(result.success).toBe(true);
    });

    it('should return error for circular references', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      const result = adapter.safeStringify(obj);
      expect(result.success).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid JSON', () => {
      expect(adapter.isValid('{"valid": true}')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(adapter.isValid('{invalid}')).toBe(false);
    });
  });
});
