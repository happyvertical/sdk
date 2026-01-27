/**
 * @happyvertical/video
 *
 * Video processing utilities with adapter pattern for composition and transcoding.
 *
 * @example
 * ```typescript
 * import { FFmpegProcessor } from '@happyvertical/video';
 *
 * const processor = new FFmpegProcessor();
 *
 * // Get video metadata
 * const metadata = await processor.getMetadata('input.mp4');
 * console.log(`Duration: ${metadata.duration}s, Resolution: ${metadata.width}x${metadata.height}`);
 *
 * // Extract thumbnail at 2 seconds
 * const thumbnail = await processor.extractFrame('input.mp4', 2.0, {
 *   format: 'jpg',
 *   width: 1280,
 *   quality: 90,
 * });
 * fs.writeFileSync('thumbnail.jpg', thumbnail);
 *
 * // Add lower-third overlay
 * const output = await processor.addLowerThird('input.mp4', {
 *   title: 'John Smith',
 *   subtitle: 'Senior Correspondent',
 *   style: 'news',
 *   primaryColor: '#1a1a1a',
 *   accentColor: '#cc0000',
 *   duration: 5,
 *   startTime: 0,
 * });
 *
 * // Compose video with multiple operations
 * const composed = await processor.compose({
 *   baseVideo: 'input.mp4',
 *   audio: 'narration.mp3',
 *   overlays: [
 *     {
 *       type: 'image',
 *       content: 'logo.png',
 *       position: { x: 'right', y: 'top', padding: 20 },
 *       opacity: 0.8,
 *     },
 *   ],
 *   outputFormat: 'mp4',
 *   quality: 20,
 * });
 *
 * // Transcode for different platforms
 * const youtubeShort = await processor.transcode('input.mp4', {
 *   format: 'mp4',
 *   width: 1080,
 *   height: 1920,
 *   video: {
 *     codec: 'h264',
 *     preset: 'medium',
 *     crf: 23,
 *   },
 *   audio: {
 *     codec: 'aac',
 *     bitrate: '128k',
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Adapters
export { FFmpegProcessor } from './adapters/ffmpeg.js';

// Types
export type {
  AudioCodecOptions,
  AudioMixOptions,
  ComposeOptions,
  ExtractFrameOptions,
  LowerThirdConfig,
  OverlayConfig,
  OverlayPosition,
  TextOverlayOptions,
  TranscodeOptions,
  VideoCodecOptions,
  VideoFormat,
  VideoMetadata,
  VideoProcessor,
  VideoProcessorOptions,
} from './types.js';
