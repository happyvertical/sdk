import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FFmpegProcessor } from './index.js';

async function createTwoFrameAnimatedWebp(): Promise<Buffer> {
  const width = 8;
  const frameHeight = 8;
  const frameCount = 2;
  const channels = 4;
  const raw = Buffer.alloc(width * frameHeight * frameCount * channels);

  for (let y = 0; y < frameHeight * frameCount; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const isFirstFrame = y < frameHeight;
      raw[offset] = isFirstFrame ? 255 : 0;
      raw[offset + 1] = isFirstFrame ? 0 : 255;
      raw[offset + 2] = 0;
      raw[offset + 3] = 255;
    }
  }

  return sharp(raw, {
    raw: {
      width,
      height: frameHeight * frameCount,
      channels,
      pageHeight: frameHeight,
    },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

describe('video package', () => {
  it('runs against Sharp 0.35.3', () => {
    expect(sharp.versions.sharp).toBe('0.35.3');
  });

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

    it('extracts animated WEBP pages as individual frame images', async () => {
      const frameHeight = 8;
      const tempRoot = await mkdtemp(join(tmpdir(), 'video-webp-'));
      const inspectedFrames: Array<{
        height: number | undefined;
        firstPixel: number[];
      }> = [];

      try {
        const processor = new FFmpegProcessor({ tempDir: tempRoot });
        (
          processor as unknown as {
            runFFmpeg: (args: string[]) => Promise<void>;
          }
        ).runFFmpeg = async (args) => {
          const inputFlagIndex = args.lastIndexOf('-i');
          if (inputFlagIndex < 0 || inputFlagIndex === args.length - 1) {
            throw new Error('Expected FFmpeg args to include an input pattern');
          }

          const inputPattern = args[inputFlagIndex + 1];
          const outputPath = args.at(-1);
          if (!inputPattern || !outputPath) {
            throw new Error('Expected FFmpeg input pattern and output path');
          }

          const frameDir = dirname(inputPattern);
          for (let frame = 1; frame <= 2; frame += 1) {
            const framePath = join(
              frameDir,
              `frame_${String(frame).padStart(4, '0')}.png`,
            );
            const metadata = await sharp(framePath).metadata();
            const pixels = await sharp(framePath).raw().toBuffer();
            inspectedFrames.push({
              height: metadata.height,
              firstPixel: Array.from(pixels.slice(0, 3)),
            });
          }

          await writeFile(outputPath, Buffer.from('mp4'));
        };

        const result = await processor.convertWebpToMp4(
          await createTwoFrameAnimatedWebp(),
        );

        expect(result.toString()).toBe('mp4');
        expect(inspectedFrames.map((frame) => frame.height)).toEqual([
          frameHeight,
          frameHeight,
        ]);
        expect(inspectedFrames[0].firstPixel[0]).toBeGreaterThan(
          inspectedFrames[0].firstPixel[1],
        );
        expect(inspectedFrames[1].firstPixel[1]).toBeGreaterThan(
          inspectedFrames[1].firstPixel[0],
        );
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
