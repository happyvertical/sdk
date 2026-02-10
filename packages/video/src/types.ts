/**
 * Video Processing Types
 *
 * Types for video composition, transcoding, and manipulation.
 */

/**
 * Configuration for the video processor
 */
export interface VideoProcessorOptions {
  /**
   * Path to FFmpeg binary
   * @default 'ffmpeg' (expects ffmpeg in PATH)
   */
  ffmpegPath?: string;

  /**
   * Path to FFprobe binary
   * @default 'ffprobe' (expects ffprobe in PATH)
   */
  ffprobePath?: string;

  /**
   * Temporary directory for intermediate files
   * @default system temp directory
   */
  tempDir?: string;

  /**
   * Default timeout for operations in milliseconds
   * @default 300000 (5 minutes)
   */
  timeout?: number;
}

/**
 * Video metadata extracted from a file
 */
export interface VideoMetadata {
  /**
   * Duration in seconds
   */
  duration: number;

  /**
   * Width in pixels
   */
  width: number;

  /**
   * Height in pixels
   */
  height: number;

  /**
   * Frames per second
   */
  fps: number;

  /**
   * Video codec (e.g., 'h264', 'vp9')
   */
  codec: string;

  /**
   * Bitrate in bits per second
   */
  bitrate?: number;

  /**
   * Aspect ratio as string (e.g., '16:9')
   */
  aspectRatio: string;

  /**
   * Audio streams present
   */
  hasAudio: boolean;

  /**
   * Audio codec if present
   */
  audioCodec?: string;

  /**
   * Audio sample rate if present
   */
  audioSampleRate?: number;

  /**
   * File size in bytes
   */
  fileSize?: number;

  /**
   * Container format (e.g., 'mp4', 'webm')
   */
  format: string;
}

/**
 * Options for video composition
 */
export interface ComposeOptions {
  /**
   * Base video buffer or path
   */
  baseVideo: Buffer | string;

  /**
   * Audio track to add/replace (optional)
   */
  audio?: Buffer | string;

  /**
   * Overlays to add to the video
   */
  overlays?: OverlayConfig[];

  /**
   * Output format
   * @default 'mp4'
   */
  outputFormat?: VideoFormat;

  /**
   * Output quality (1-51 for h264, lower is better)
   * @default 23
   */
  quality?: number;

  /**
   * Output width (optional, maintains aspect ratio if only width specified)
   */
  width?: number;

  /**
   * Output height (optional, maintains aspect ratio if only height specified)
   */
  height?: number;

  /**
   * Output fps (optional, uses source fps if not specified)
   */
  fps?: number;
}

/**
 * Configuration for a video overlay
 */
export interface OverlayConfig {
  /**
   * Type of overlay
   */
  type: 'image' | 'text' | 'video';

  /**
   * Content for the overlay
   * - For 'image': Buffer or path to image file
   * - For 'text': The text string to display
   * - For 'video': Buffer or path to video file
   */
  content: Buffer | string;

  /**
   * Position of the overlay
   */
  position: OverlayPosition;

  /**
   * Start time in seconds (0 = from beginning)
   * @default 0
   */
  startTime?: number;

  /**
   * End time in seconds (undefined = until end)
   */
  endTime?: number;

  /**
   * Opacity (0-1)
   * @default 1
   */
  opacity?: number;

  /**
   * Width of overlay (optional)
   */
  width?: number;

  /**
   * Height of overlay (optional)
   */
  height?: number;

  /**
   * Text-specific options
   */
  textOptions?: TextOverlayOptions;
}

/**
 * Position configuration for overlays
 */
export interface OverlayPosition {
  /**
   * Horizontal position
   * - number: pixels from left
   * - 'left' | 'center' | 'right': alignment
   */
  x: number | 'left' | 'center' | 'right';

  /**
   * Vertical position
   * - number: pixels from top
   * - 'top' | 'center' | 'bottom': alignment
   */
  y: number | 'top' | 'center' | 'bottom';

  /**
   * Padding from edges (used with alignment keywords)
   * @default 20
   */
  padding?: number;
}

/**
 * Options for text overlays
 */
export interface TextOverlayOptions {
  /**
   * Font family
   * @default 'Arial'
   */
  fontFamily?: string;

  /**
   * Font size in pixels
   * @default 24
   */
  fontSize?: number;

  /**
   * Font color (hex or named color)
   * @default 'white'
   */
  fontColor?: string;

  /**
   * Background color (hex or named color, with alpha)
   */
  backgroundColor?: string;

  /**
   * Padding around text in pixels
   * @default 10
   */
  padding?: number;

  /**
   * Border radius in pixels (for background)
   * @default 0
   */
  borderRadius?: number;

  /**
   * Text alignment
   * @default 'left'
   */
  alignment?: 'left' | 'center' | 'right';

  /**
   * Maximum width before wrapping
   */
  maxWidth?: number;

  /**
   * Animation type for text entry
   */
  animation?: 'none' | 'fade' | 'slide-left' | 'slide-up';

  /**
   * Animation duration in seconds
   * @default 0.5
   */
  animationDuration?: number;
}

/**
 * Lower-third overlay template
 */
export interface LowerThirdConfig {
  /**
   * Primary text (e.g., person's name)
   */
  title: string;

  /**
   * Secondary text (e.g., job title)
   */
  subtitle?: string;

  /**
   * Template style
   */
  style: 'minimal' | 'news' | 'corporate' | 'gradient';

  /**
   * Primary color
   * @default '#1a1a1a'
   */
  primaryColor?: string;

  /**
   * Accent color
   * @default '#0066cc'
   */
  accentColor?: string;

  /**
   * Duration to display in seconds
   */
  duration?: number;

  /**
   * Start time in seconds
   * @default 0
   */
  startTime?: number;

  /**
   * Logo image (optional)
   */
  logo?: Buffer | string;
}

/**
 * Supported video output formats
 */
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';

/**
 * Video codec options
 */
export interface VideoCodecOptions {
  /**
   * Video codec to use
   */
  codec: 'h264' | 'h265' | 'vp9' | 'av1';

  /**
   * Encoding preset (faster = lower quality)
   */
  preset?:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'
    | 'veryslow';

  /**
   * CRF value (0-51 for h264/h265, 0-63 for vp9)
   */
  crf?: number;

  /**
   * Bitrate target (e.g., '2M', '5000k')
   */
  bitrate?: string;

  /**
   * Pixel format
   * @default 'yuv420p'
   */
  pixelFormat?: string;
}

/**
 * Audio codec options
 */
export interface AudioCodecOptions {
  /**
   * Audio codec to use
   */
  codec: 'aac' | 'mp3' | 'opus' | 'vorbis';

  /**
   * Bitrate (e.g., '128k', '192k')
   * @default '128k'
   */
  bitrate?: string;

  /**
   * Sample rate
   * @default 44100
   */
  sampleRate?: number;

  /**
   * Number of channels
   * @default 2
   */
  channels?: number;
}

/**
 * Options for video transcoding
 */
export interface TranscodeOptions {
  /**
   * Output format
   */
  format: VideoFormat;

  /**
   * Video codec options
   */
  video?: VideoCodecOptions;

  /**
   * Audio codec options
   */
  audio?: AudioCodecOptions;

  /**
   * Output width (optional)
   */
  width?: number;

  /**
   * Output height (optional)
   */
  height?: number;

  /**
   * Output fps (optional)
   */
  fps?: number;

  /**
   * Start time for trimming (seconds)
   */
  startTime?: number;

  /**
   * End time for trimming (seconds)
   */
  endTime?: number;
}

/**
 * Options for extracting frames
 */
export interface ExtractFrameOptions {
  /**
   * Output format for frame
   * @default 'png'
   */
  format?: 'png' | 'jpg' | 'webp';

  /**
   * Output width (optional)
   */
  width?: number;

  /**
   * Output height (optional)
   */
  height?: number;

  /**
   * JPEG/WebP quality (1-100)
   * @default 90
   */
  quality?: number;
}

/**
 * Video processor interface
 */
export interface VideoProcessor {
  /**
   * Compose a video with overlays and audio
   */
  compose(options: ComposeOptions): Promise<Buffer>;

  /**
   * Extract a single frame from a video
   */
  extractFrame(
    video: Buffer | string,
    timestamp: number,
    options?: ExtractFrameOptions,
  ): Promise<Buffer>;

  /**
   * Add overlays to a video
   */
  addOverlay(video: Buffer | string, overlay: OverlayConfig): Promise<Buffer>;

  /**
   * Add a lower-third overlay
   */
  addLowerThird(
    video: Buffer | string,
    config: LowerThirdConfig,
  ): Promise<Buffer>;

  /**
   * Get video metadata
   */
  getMetadata(video: Buffer | string): Promise<VideoMetadata>;

  /**
   * Transcode video to different format/codec
   */
  transcode(video: Buffer | string, options: TranscodeOptions): Promise<Buffer>;

  /**
   * Concatenate multiple videos
   */
  concatenate(videos: Array<Buffer | string>): Promise<Buffer>;

  /**
   * Mix audio into video
   */
  mixAudio(
    video: Buffer | string,
    audio: Buffer | string,
    options?: AudioMixOptions,
  ): Promise<Buffer>;

  /**
   * Convert animated WEBP to MP4
   *
   * Uses sharp to extract frames from animated WEBP (which ffmpeg can't decode),
   * then assembles them into an MP4 using ffmpeg.
   */
  convertWebpToMp4(webp: Buffer, options?: WebpConvertOptions): Promise<Buffer>;
}

/**
 * Options for converting animated WEBP to MP4
 */
export interface WebpConvertOptions {
  /**
   * Frame rate of the output MP4
   * @default 16
   */
  fps?: number;

  /**
   * Video codec options for the output
   */
  video?: VideoCodecOptions;
}

/**
 * Options for audio mixing
 */
export interface AudioMixOptions {
  /**
   * Replace existing audio or mix with it
   * @default 'replace'
   */
  mode?: 'replace' | 'mix';

  /**
   * Volume of original audio (0-1, only for 'mix' mode)
   * @default 0.5
   */
  originalVolume?: number;

  /**
   * Volume of new audio (0-1)
   * @default 1
   */
  newVolume?: number;

  /**
   * Start time for audio in video (seconds)
   * @default 0
   */
  startTime?: number;

  /**
   * Fade in duration (seconds)
   */
  fadeIn?: number;

  /**
   * Fade out duration (seconds)
   */
  fadeOut?: number;
}
