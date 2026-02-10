/**
 * FFmpeg Video Processor Adapter
 *
 * Implements video processing using FFmpeg command-line tools.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createLogger, type Logger } from '@happyvertical/logger';
import { ValidationError } from '@happyvertical/utils';

import sharp from 'sharp';

import type {
  AudioMixOptions,
  ComposeOptions,
  ExtractFrameOptions,
  LowerThirdConfig,
  OverlayConfig,
  TranscodeOptions,
  VideoCodecOptions,
  VideoMetadata,
  VideoProcessor,
  VideoProcessorOptions,
  WebpConvertOptions,
} from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * FFmpeg-based video processor
 *
 * @example
 * ```typescript
 * import { FFmpegProcessor } from '@happyvertical/video';
 *
 * const processor = new FFmpegProcessor();
 *
 * // Get video metadata
 * const metadata = await processor.getMetadata('input.mp4');
 * console.log(`Duration: ${metadata.duration}s`);
 *
 * // Extract thumbnail
 * const thumbnail = await processor.extractFrame('input.mp4', 2.0, {
 *   format: 'jpg',
 *   width: 1280,
 * });
 *
 * // Add lower-third overlay
 * const output = await processor.addLowerThird('input.mp4', {
 *   title: 'John Smith',
 *   subtitle: 'News Anchor',
 *   style: 'news',
 *   duration: 5,
 * });
 * ```
 */
export class FFmpegProcessor implements VideoProcessor {
  private options: Required<VideoProcessorOptions>;
  private logger: Logger;

  constructor(options: VideoProcessorOptions = {}) {
    this.options = {
      ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
      ffprobePath: options.ffprobePath ?? 'ffprobe',
      tempDir: options.tempDir ?? tmpdir(),
      timeout: options.timeout ?? 300000,
    };

    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Create a temporary directory for processing
   */
  private createTempDir(): string {
    return mkdtempSync(join(this.options.tempDir, 'video-'));
  }

  /**
   * Save buffer to a temporary file
   */
  private async saveToTemp(
    buffer: Buffer,
    ext: string,
    tempDir: string,
  ): Promise<string> {
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filepath = join(tempDir, filename);
    await writeFile(filepath, buffer);
    return filepath;
  }

  /**
   * Get input path (save buffer to temp if needed)
   */
  private async getInputPath(
    input: Buffer | string,
    ext: string,
    tempDir: string,
  ): Promise<string> {
    if (Buffer.isBuffer(input)) {
      return this.saveToTemp(input, ext, tempDir);
    }
    return input;
  }

  /**
   * Run FFmpeg command
   * Uses execFile with array arguments to prevent command injection
   */
  private async runFFmpeg(args: string[], timeout?: number): Promise<void> {
    this.logger.debug('Running FFmpeg', {
      path: this.options.ffmpegPath,
      args,
    });

    await execFileAsync(this.options.ffmpegPath, args, {
      timeout: timeout ?? this.options.timeout,
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });
  }

  /**
   * Run FFprobe command and parse JSON output
   * Uses execFile with array arguments to prevent command injection
   */
  private async runFFprobe(input: string): Promise<any> {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      input,
    ];
    const { stdout } = await execFileAsync(this.options.ffprobePath, args, {
      timeout: 30000,
    });
    return JSON.parse(stdout);
  }

  /**
   * Get video metadata
   */
  async getMetadata(video: Buffer | string): Promise<VideoMetadata> {
    let tempDir: string | null = null;
    let inputPath: string;

    try {
      if (Buffer.isBuffer(video)) {
        tempDir = this.createTempDir();
        inputPath = await this.saveToTemp(video, 'mp4', tempDir);
      } else {
        inputPath = video;
      }

      const probe = await this.runFFprobe(inputPath);

      const videoStream = probe.streams?.find(
        (s: { codec_type?: string }) => s.codec_type === 'video',
      );
      const audioStream = probe.streams?.find(
        (s: { codec_type?: string }) => s.codec_type === 'audio',
      );
      const format = probe.format;

      if (!videoStream) {
        throw new ValidationError('No video stream found in file');
      }

      // Calculate aspect ratio
      const gcd = (a: number, b: number): number =>
        b === 0 ? a : gcd(b, a % b);
      const aspectGcd = gcd(videoStream.width, videoStream.height);
      const aspectRatio = `${videoStream.width / aspectGcd}:${videoStream.height / aspectGcd}`;

      // Parse frame rate
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        fps = den ? num / den : num;
      }

      return {
        duration: parseFloat(format.duration) || 0,
        width: videoStream.width,
        height: videoStream.height,
        fps,
        codec: videoStream.codec_name,
        bitrate: parseInt(format.bit_rate, 10),
        aspectRatio,
        hasAudio: !!audioStream,
        audioCodec: audioStream?.codec_name,
        audioSampleRate: audioStream?.sample_rate
          ? parseInt(audioStream.sample_rate, 10)
          : undefined,
        fileSize: parseInt(format.size, 10),
        format: format.format_name.split(',')[0],
      };
    } finally {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Extract a single frame from video
   */
  async extractFrame(
    video: Buffer | string,
    timestamp: number,
    options: ExtractFrameOptions = {},
  ): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      const inputPath = await this.getInputPath(video, 'mp4', tempDir);
      const format = options.format ?? 'png';
      const outputPath = join(tempDir, `frame.${format}`);

      const args = [
        '-y',
        '-ss',
        timestamp.toFixed(3),
        '-i',
        inputPath,
        '-vframes',
        '1',
      ];

      // Scale if dimensions specified
      if (options.width || options.height) {
        const w = options.width ?? -1;
        const h = options.height ?? -1;
        args.push('-vf', `scale=${w}:${h}`);
      }

      // Quality for JPEG/WebP
      if (format === 'jpg' || format === 'webp') {
        const quality = options.quality ?? 90;
        args.push('-q:v', Math.round(((100 - quality) / 100) * 31).toString());
      }

      args.push(outputPath);

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Transcode video to different format/codec
   */
  async transcode(
    video: Buffer | string,
    options: TranscodeOptions,
  ): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      const inputPath = await this.getInputPath(video, 'mp4', tempDir);
      const outputPath = join(tempDir, `output.${options.format}`);

      const args = ['-y', '-i', inputPath];

      // Time trimming
      if (options.startTime !== undefined) {
        args.push('-ss', options.startTime.toFixed(3));
      }
      if (options.endTime !== undefined) {
        args.push('-to', options.endTime.toFixed(3));
      }

      // Video codec
      if (options.video) {
        args.push(...this.getVideoCodecArgs(options.video));
      }

      // Audio codec
      if (options.audio) {
        args.push('-c:a', options.audio.codec);
        if (options.audio.bitrate) args.push('-b:a', options.audio.bitrate);
        if (options.audio.sampleRate)
          args.push('-ar', options.audio.sampleRate.toString());
        if (options.audio.channels)
          args.push('-ac', options.audio.channels.toString());
      }

      // Scaling
      if (options.width || options.height) {
        const w = options.width ?? -1;
        const h = options.height ?? -1;
        args.push('-vf', `scale=${w}:${h}`);
      }

      // FPS
      if (options.fps) {
        args.push('-r', options.fps.toString());
      }

      args.push(outputPath);

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get FFmpeg args for video codec options
   */
  private getVideoCodecArgs(options: VideoCodecOptions): string[] {
    const args: string[] = [];

    const codecMap: Record<string, string> = {
      h264: 'libx264',
      h265: 'libx265',
      vp9: 'libvpx-vp9',
      av1: 'libaom-av1',
    };

    args.push('-c:v', codecMap[options.codec] ?? options.codec);

    if (options.preset) {
      args.push('-preset', options.preset);
    }

    if (options.crf !== undefined) {
      args.push('-crf', options.crf.toString());
    }

    if (options.bitrate) {
      args.push('-b:v', options.bitrate);
    }

    if (options.pixelFormat) {
      args.push('-pix_fmt', options.pixelFormat);
    } else {
      args.push('-pix_fmt', 'yuv420p'); // Default for compatibility
    }

    return args;
  }

  /**
   * Add an overlay to video
   */
  async addOverlay(
    video: Buffer | string,
    overlay: OverlayConfig,
  ): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      const inputPath = await this.getInputPath(video, 'mp4', tempDir);
      const outputPath = join(tempDir, 'output.mp4');

      let filterComplex = '';
      const inputs = ['-i', inputPath];

      if (overlay.type === 'image') {
        const imagePath = await this.getInputPath(
          overlay.content,
          'png',
          tempDir,
        );
        inputs.push('-i', imagePath);

        const pos = this.getOverlayPosition(overlay.position);
        filterComplex = `[1:v]${overlay.width ? `scale=${overlay.width}:-1,` : ''}format=rgba,colorchannelmixer=aa=${overlay.opacity ?? 1}[ovr];[0:v][ovr]overlay=${pos.x}:${pos.y}`;

        if (overlay.startTime !== undefined || overlay.endTime !== undefined) {
          const enable = this.getEnableExpression(
            overlay.startTime,
            overlay.endTime,
          );
          filterComplex += `:enable='${enable}'`;
        }
      } else if (overlay.type === 'text') {
        const textOpts = overlay.textOptions ?? {};
        const pos = this.getOverlayPosition(overlay.position);

        filterComplex = `drawtext=text='${this.escapeFFmpegText(overlay.content as string)}'`;
        filterComplex += `:x=${pos.x}:y=${pos.y}`;
        filterComplex += `:fontsize=${textOpts.fontSize ?? 24}`;
        filterComplex += `:fontcolor=${textOpts.fontColor ?? 'white'}`;

        if (textOpts.fontFamily) {
          filterComplex += `:fontfile=${textOpts.fontFamily}`;
        }

        if (textOpts.backgroundColor) {
          filterComplex += `:box=1:boxcolor=${textOpts.backgroundColor}:boxborderw=${textOpts.padding ?? 10}`;
        }

        if (overlay.startTime !== undefined || overlay.endTime !== undefined) {
          const enable = this.getEnableExpression(
            overlay.startTime,
            overlay.endTime,
          );
          filterComplex += `:enable='${enable}'`;
        }
      }

      const args = [
        '-y',
        ...inputs,
        '-filter_complex',
        filterComplex,
        '-c:a',
        'copy',
        outputPath,
      ];

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Add a lower-third overlay
   */
  async addLowerThird(
    video: Buffer | string,
    config: LowerThirdConfig,
  ): Promise<Buffer> {
    // Generate lower-third as image, then overlay
    const tempDir = this.createTempDir();

    try {
      const inputPath = await this.getInputPath(video, 'mp4', tempDir);
      const outputPath = join(tempDir, 'output.mp4');

      // Get video dimensions
      const metadata = await this.getMetadata(inputPath);

      // Create lower-third filter
      const startTime = config.startTime ?? 0;
      const duration = config.duration ?? 5;
      const endTime = startTime + duration;

      const primaryColor = config.primaryColor ?? '0x1a1a1a';

      // Build drawtext filter for lower-third
      const titleY = metadata.height - 100;
      const subtitleY = metadata.height - 60;

      let filter = `drawtext=text='${this.escapeFFmpegText(config.title)}':x=50:y=${titleY}:fontsize=32:fontcolor=white:box=1:boxcolor=${primaryColor}@0.8:boxborderw=10:enable='between(t,${startTime},${endTime})'`;

      if (config.subtitle) {
        filter += `,drawtext=text='${this.escapeFFmpegText(config.subtitle)}':x=50:y=${subtitleY}:fontsize=20:fontcolor=white@0.9:enable='between(t,${startTime},${endTime})'`;
      }

      const args = [
        '-y',
        '-i',
        inputPath,
        '-vf',
        filter,
        '-c:a',
        'copy',
        outputPath,
      ];

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Compose video with overlays and audio
   */
  async compose(options: ComposeOptions): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      const inputPath = await this.getInputPath(
        options.baseVideo,
        'mp4',
        tempDir,
      );
      let currentVideo = inputPath;

      // Apply overlays sequentially
      if (options.overlays) {
        for (const overlay of options.overlays) {
          const result = await this.addOverlay(currentVideo, overlay);
          const tempOutput = join(
            tempDir,
            `overlay_${crypto.randomUUID()}.mp4`,
          );
          await writeFile(tempOutput, result);
          currentVideo = tempOutput;
        }
      }

      // Mix audio if provided
      if (options.audio) {
        const result = await this.mixAudio(currentVideo, options.audio);
        const tempOutput = join(tempDir, `audio_${crypto.randomUUID()}.mp4`);
        await writeFile(tempOutput, result);
        currentVideo = tempOutput;
      }

      // Final transcode to target format/quality
      const format = options.outputFormat ?? 'mp4';
      const outputPath = join(tempDir, `output.${format}`);

      const args = ['-y', '-i', currentVideo];

      // Scale if dimensions specified
      if (options.width || options.height) {
        const w = options.width ?? -1;
        const h = options.height ?? -1;
        args.push('-vf', `scale=${w}:${h}`);
      }

      // FPS
      if (options.fps) {
        args.push('-r', options.fps.toString());
      }

      // Quality
      const quality = options.quality ?? 23;
      args.push('-crf', quality.toString());
      args.push('-preset', 'medium');
      args.push('-c:a', 'aac', '-b:a', '128k');

      args.push(outputPath);

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Concatenate multiple videos
   */
  async concatenate(videos: Array<Buffer | string>): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      // Save all videos to temp and create concat file
      const videoPaths: string[] = [];
      for (let i = 0; i < videos.length; i++) {
        const path = await this.getInputPath(videos[i], 'mp4', tempDir);
        videoPaths.push(path);
      }

      // Create concat list file
      const listPath = join(tempDir, 'concat.txt');
      const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');
      writeFileSync(listPath, listContent);

      const outputPath = join(tempDir, 'output.mp4');

      const args = [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        outputPath,
      ];

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Mix audio into video
   */
  async mixAudio(
    video: Buffer | string,
    audio: Buffer | string,
    options: AudioMixOptions = {},
  ): Promise<Buffer> {
    const tempDir = this.createTempDir();

    try {
      const videoPath = await this.getInputPath(video, 'mp4', tempDir);
      const audioPath = await this.getInputPath(audio, 'mp3', tempDir);
      const outputPath = join(tempDir, 'output.mp4');

      const mode = options.mode ?? 'replace';
      const args = ['-y', '-i', videoPath, '-i', audioPath];

      if (mode === 'replace') {
        // Replace audio entirely
        args.push('-map', '0:v', '-map', '1:a');

        // Apply volume
        if (options.newVolume !== undefined && options.newVolume !== 1) {
          args.push('-af', `volume=${options.newVolume}`);
        }

        // Apply fades
        if (options.fadeIn || options.fadeOut) {
          const fadeFilters: string[] = [];
          if (options.fadeIn) {
            fadeFilters.push(`afade=t=in:d=${options.fadeIn}`);
          }
          if (options.fadeOut) {
            fadeFilters.push(`afade=t=out:d=${options.fadeOut}`);
          }
          args.push('-af', fadeFilters.join(','));
        }
      } else {
        // Mix audio streams
        const origVol = options.originalVolume ?? 0.5;
        const newVol = options.newVolume ?? 1;
        args.push(
          '-filter_complex',
          `[0:a]volume=${origVol}[a0];[1:a]volume=${newVol}[a1];[a0][a1]amix=inputs=2:duration=first[a]`,
          '-map',
          '0:v',
          '-map',
          '[a]',
        );
      }

      args.push('-c:v', 'copy', '-shortest', outputPath);

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Convert animated WEBP to MP4
   *
   * Uses sharp to extract frames from animated WEBP (which ffmpeg can't decode
   * natively), then assembles them into an MP4 using ffmpeg.
   */
  async convertWebpToMp4(
    webp: Buffer,
    options: WebpConvertOptions = {},
  ): Promise<Buffer> {
    const fps = options.fps ?? 16;
    const tempDir = this.createTempDir();

    try {
      // Get frame count from animated WEBP metadata
      const metadata = await sharp(webp, {
        animated: true,
        pages: -1,
      }).metadata();
      const pageHeight = metadata.pageHeight ?? metadata.height ?? 480;
      const frameCount = metadata.pages ?? 1;

      this.logger.debug('Extracting WEBP frames', {
        frameCount,
        width: metadata.width,
        pageHeight,
      });

      // Extract each frame as PNG using sharp's page option
      for (let i = 0; i < frameCount; i++) {
        const frame = await sharp(webp, { animated: true, page: i })
          .png()
          .toBuffer();

        const framePath = join(
          tempDir,
          `frame_${String(i + 1).padStart(4, '0')}.png`,
        );
        await writeFile(framePath, frame);
      }

      // Assemble frames into MP4 with ffmpeg
      const outputPath = join(tempDir, 'output.mp4');
      const args = [
        '-y',
        '-framerate',
        fps.toString(),
        '-start_number',
        '1',
        '-i',
        join(tempDir, 'frame_%04d.png'),
      ];

      // Video codec
      if (options.video) {
        args.push(...this.getVideoCodecArgs(options.video));
      } else {
        args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
      }

      args.push(outputPath);

      await this.runFFmpeg(args);
      return await readFile(outputPath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Get overlay position as FFmpeg expression
   */
  private getOverlayPosition(position: OverlayConfig['position']): {
    x: string;
    y: string;
  } {
    const padding = position.padding ?? 20;

    let x: string;
    let y: string;

    if (typeof position.x === 'number') {
      x = position.x.toString();
    } else {
      switch (position.x) {
        case 'left':
          x = padding.toString();
          break;
        case 'center':
          x = '(W-w)/2';
          break;
        case 'right':
          x = `W-w-${padding}`;
          break;
      }
    }

    if (typeof position.y === 'number') {
      y = position.y.toString();
    } else {
      switch (position.y) {
        case 'top':
          y = padding.toString();
          break;
        case 'center':
          y = '(H-h)/2';
          break;
        case 'bottom':
          y = `H-h-${padding}`;
          break;
      }
    }

    return { x, y };
  }

  /**
   * Get FFmpeg enable expression for time-based visibility
   */
  private getEnableExpression(startTime?: number, endTime?: number): string {
    if (startTime !== undefined && endTime !== undefined) {
      return `between(t,${startTime},${endTime})`;
    }
    if (startTime !== undefined) {
      return `gte(t,${startTime})`;
    }
    if (endTime !== undefined) {
      return `lte(t,${endTime})`;
    }
    return '1';
  }

  /**
   * Escape text for FFmpeg drawtext filter
   */
  private escapeFFmpegText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  }
}
