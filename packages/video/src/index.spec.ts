import { describe, expect, it } from 'vitest';
import { FFmpegProcessor } from './index.js';

describe('video package', () => {
  describe('exports', () => {
    it('should export FFmpegProcessor class', () => {
      expect(FFmpegProcessor).toBeDefined();
      expect(typeof FFmpegProcessor).toBe('function');
    });
  });

  describe('FFmpegProcessor', () => {
    it('should create processor with default options', () => {
      const processor = new FFmpegProcessor();
      expect(processor).toBeInstanceOf(FFmpegProcessor);
    });

    it('should create processor with custom paths', () => {
      const processor = new FFmpegProcessor({
        ffmpegPath: '/custom/ffmpeg',
        ffprobePath: '/custom/ffprobe',
      });
      expect(processor).toBeInstanceOf(FFmpegProcessor);
    });
  });
});
