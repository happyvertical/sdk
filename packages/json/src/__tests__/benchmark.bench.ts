/**
 * Benchmarks for JSON parsing and serialization
 *
 * Run with: pnpm test:bench
 */

import { bench, describe } from 'vitest';
import { NativeAdapter } from '../adapters/native.js';
import { clone, JSONFactory, parse, stringify } from '../index.js';

// Sample data representing various use cases
const smallObject = { key: 'value', num: 42, bool: true };

const mediumObject = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  settings: {
    theme: 'dark',
    notifications: true,
    language: 'en',
  },
  roles: ['admin', 'user', 'editor'],
  createdAt: '2024-01-15T12:00:00Z',
  metadata: {
    lastLogin: '2024-01-15T14:30:00Z',
    loginCount: 42,
  },
};

const largeArray = Array.from({ length: 1000 }, (_, i) => ({
  id: `item-${i}`,
  value: Math.random(),
  tags: [`tag-${i % 10}`, `category-${i % 5}`],
  nested: { deep: { value: i } },
}));

// Generate a manifest-like structure (simulating SMRT manifest)
const manifestLike = {
  version: '1.0.0',
  generated: new Date().toISOString(),
  packages: Array.from({ length: 47 }, (_, i) => ({
    name: `@happyvertical/smrt-package-${i}`,
    version: '0.67.1',
    classes: Array.from({ length: 5 }, (_, j) => ({
      qualifiedName: `@happyvertical/smrt-package-${i}:Class${j}`,
      tableName: `class_${j}_table`,
      fields: Array.from({ length: 10 }, (_, k) => ({
        name: `field_${k}`,
        type: ['text', 'integer', 'decimal', 'boolean', 'datetime'][k % 5],
        required: k < 3,
        column: `field_${k}_col`,
      })),
    })),
  })),
};

// Pre-stringify for parse benchmarks
const smallJson = JSON.stringify(smallObject);
const mediumJson = JSON.stringify(mediumObject);
const largeJson = JSON.stringify(largeArray);
const manifestJson = JSON.stringify(manifestLike);

// Get adapters
const nativeAdapter = new NativeAdapter();
const defaultAdapter = JSONFactory.getDefault();

describe('parse benchmarks', () => {
  describe('small object', () => {
    bench('native JSON.parse', () => {
      JSON.parse(smallJson);
    });

    bench('NativeAdapter.parse', () => {
      nativeAdapter.parse(smallJson);
    });

    bench('default adapter parse', () => {
      defaultAdapter.parse(smallJson);
    });

    bench('@happyvertical/json parse', () => {
      parse(smallJson);
    });
  });

  describe('medium object', () => {
    bench('native JSON.parse', () => {
      JSON.parse(mediumJson);
    });

    bench('@happyvertical/json parse', () => {
      parse(mediumJson);
    });
  });

  describe('large array (1000 items)', () => {
    bench('native JSON.parse', () => {
      JSON.parse(largeJson);
    });

    bench('@happyvertical/json parse', () => {
      parse(largeJson);
    });
  });

  describe('manifest-like structure (~680KB)', () => {
    bench('native JSON.parse', () => {
      JSON.parse(manifestJson);
    });

    bench('@happyvertical/json parse', () => {
      parse(manifestJson);
    });
  });
});

describe('stringify benchmarks', () => {
  describe('small object', () => {
    bench('native JSON.stringify', () => {
      JSON.stringify(smallObject);
    });

    bench('@happyvertical/json stringify', () => {
      stringify(smallObject);
    });
  });

  describe('medium object', () => {
    bench('native JSON.stringify', () => {
      JSON.stringify(mediumObject);
    });

    bench('@happyvertical/json stringify', () => {
      stringify(mediumObject);
    });
  });

  describe('large array (1000 items)', () => {
    bench('native JSON.stringify', () => {
      JSON.stringify(largeArray);
    });

    bench('@happyvertical/json stringify', () => {
      stringify(largeArray);
    });
  });

  describe('manifest-like structure', () => {
    bench('native JSON.stringify', () => {
      JSON.stringify(manifestLike);
    });

    bench('@happyvertical/json stringify', () => {
      stringify(manifestLike);
    });
  });
});

describe('clone benchmarks', () => {
  describe('small object', () => {
    bench('native JSON round-trip', () => {
      JSON.parse(JSON.stringify(smallObject));
    });

    bench('@happyvertical/json clone', () => {
      clone(smallObject);
    });
  });

  describe('medium object', () => {
    bench('native JSON round-trip', () => {
      JSON.parse(JSON.stringify(mediumObject));
    });

    bench('@happyvertical/json clone', () => {
      clone(mediumObject);
    });
  });

  describe('large array (1000 items)', () => {
    bench('native JSON round-trip', () => {
      JSON.parse(JSON.stringify(largeArray));
    });

    bench('@happyvertical/json clone', () => {
      clone(largeArray);
    });
  });
});
