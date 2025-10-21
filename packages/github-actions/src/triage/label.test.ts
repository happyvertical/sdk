/**
 * Label Formatting Tests
 */

import { describe, expect, it } from 'vitest';
import { getTypeLabel } from './label.js';

describe('Label Formatting', () => {
  describe('getTypeLabel', () => {
    it('should format bug type with type: prefix', () => {
      expect(getTypeLabel('bug')).toBe('type:bug');
    });

    it('should format feature type with type: prefix', () => {
      expect(getTypeLabel('feature')).toBe('type:feature');
    });

    it('should format enhancement type with type: prefix', () => {
      expect(getTypeLabel('enhancement')).toBe('type:enhancement');
    });

    it('should format tech-debt type with type: prefix', () => {
      expect(getTypeLabel('tech-debt')).toBe('type:tech-debt');
    });

    it('should format epic type with type: prefix', () => {
      expect(getTypeLabel('epic')).toBe('type:epic');
    });

    it('should format documentation type with type: prefix', () => {
      expect(getTypeLabel('documentation')).toBe('type:documentation');
    });

    it('should format question type with type: prefix', () => {
      expect(getTypeLabel('question')).toBe('type:question');
    });

    it('should handle any string value', () => {
      // The function doesn't validate - it just formats
      expect(getTypeLabel('custom')).toBe('type:custom');
      expect(getTypeLabel('')).toBe('type:');
    });
  });
});
