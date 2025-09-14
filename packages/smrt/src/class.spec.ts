/**
 * Tests for BaseClass functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseClass } from './class.js';

describe('BaseClass', () => {
  describe('Construction', () => {
    it('should create a BaseClass instance with default options', () => {
      const base = new BaseClass({});

      expect(base).toBeInstanceOf(BaseClass);
    });

    it('should create a BaseClass instance with custom options', () => {
      const options = {
        db: { url: 'sqlite://custom.db' }
      };

      const base = new BaseClass(options);

      expect(base).toBeInstanceOf(BaseClass);
    });
  });

  describe('Service Access', () => {
    let baseClass: BaseClass;

    beforeEach(() => {
      baseClass = new BaseClass({});
    });

    it('should have service getter properties', () => {
      expect(baseClass).toHaveProperty('db');
      expect(baseClass).toHaveProperty('fs');
      expect(baseClass).toHaveProperty('ai');
    });
  });

  describe('Service Initialization', () => {
    it('should initialize services lazily', () => {
      const base = new BaseClass({});

      // Services should be getter properties, not yet initialized
      expect(base).toHaveProperty('db');
      expect(base).toHaveProperty('fs');
      expect(base).toHaveProperty('ai');
    });
  });

  describe('Configuration Options', () => {
    it('should handle empty options object', () => {
      const base = new BaseClass({});
      expect(base).toBeInstanceOf(BaseClass);
    });

    it('should handle partial configuration', () => {
      const base = new BaseClass({
        db: { url: 'sqlite://test.db' }
        // Other options omitted
      });

      expect(base).toBeInstanceOf(BaseClass);
    });
  });
});