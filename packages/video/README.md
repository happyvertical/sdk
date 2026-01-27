---
id: video
title: "@happyvertical/video: Video Processing"
sidebar_label: "@happyvertical/video"
sidebar_position: 12
---

# @happyvertical/video

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Video processing utilities with adapter pattern for composition and transcoding in the HAVE SDK.

## Overview

The `@happyvertical/video` package provides a unified interface for video processing operations using FFmpeg. It supports video composition, transcoding, overlay placement, thumbnail extraction, and lower-third generation for news-style video production.

## Features

- **Video Composition**: Combine video, audio, and overlays
- **Transcoding**: Convert between formats and adjust quality
- **Thumbnail Extraction**: Extract frames at specific timestamps
- **Lower-Third Overlays**: News-style name/title graphics
- **Image Overlays**: Position logos and watermarks
- **Audio Mixing**: Combine multiple audio tracks
- **Metadata Extraction**: Get duration, resolution, codec info
- **Format Conversion**: Support for MP4, WebM, MOV, and more
- **Type-Safe**: Full TypeScript support

## Installation

```bash
# Install with bun (recommended)
bun add @happyvertical/video

# Or with npm
npm install @happyvertical/video

# Or with pnpm
pnpm add @happyvertical/video
```

### Prerequisites

FFmpeg must be installed and available in your system PATH:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (with Chocolatey)
choco install ffmpeg
```

## Quick Start

### Basic Usage

```typescript
import { FFmpegProcessor } from '@happyvertical/video';

const processor = new FFmpegProcessor();

// Get video metadata
const metadata = await processor.getMetadata('input.mp4');
console.log(`Duration: ${metadata.duration}s`);
console.log(`Resolution: ${metadata.width}x${metadata.height}`);
console.log(`FPS: ${metadata.fps}`);

// Extract thumbnail
const thumbnail = await processor.extractFrame('input.mp4', 2.0, {
  format: 'jpg',
  width: 1280,
  quality: 90,
});
fs.writeFileSync('thumbnail.jpg', thumbnail);
```

### Video Composition

```typescript
const output = await processor.compose({
  baseVideo: 'input.mp4',
  audio: 'narration.mp3',
  overlays: [
    {
      type: 'image',
      content: 'logo.png',
      position: { x: 'right', y: 'top', padding: 20 },
      opacity: 0.8,
    },
    {
      type: 'text',
      content: 'BREAKING NEWS',
      position: { x: 'center', y: 'bottom', padding: 50 },
      style: {
        fontSize: 48,
        fontColor: 'white',
        backgroundColor: 'red',
      },
    },
  ],
  outputFormat: 'mp4',
  quality: 20,
});

fs.writeFileSync('output.mp4', output);
```

### Lower-Third Graphics

```typescript
// Add news-style lower-third with name and title
const output = await processor.addLowerThird('input.mp4', {
  title: 'John Smith',
  subtitle: 'Senior Correspondent',
  style: 'news',
  primaryColor: '#1a1a1a',
  accentColor: '#cc0000',
  duration: 5, // seconds
  startTime: 0,
  fadeIn: 0.5,
  fadeOut: 0.5,
});
```

### Transcoding for Social Platforms

```typescript
// YouTube Shorts (9:16 vertical)
const youtubeShort = await processor.transcode('input.mp4', {
  format: 'mp4',
  width: 1080,
  height: 1920,
  video: {
    codec: 'h264',
    preset: 'medium',
    crf: 23,
  },
  audio: {
    codec: 'aac',
    bitrate: '128k',
  },
});

// Web-optimized (16:9 horizontal)
const webVideo = await processor.transcode('input.mp4', {
  format: 'mp4',
  width: 1920,
  height: 1080,
  video: {
    codec: 'h264',
    preset: 'slow',
    crf: 20,
  },
  audio: {
    codec: 'aac',
    bitrate: '192k',
  },
});
```

## API Reference

### FFmpegProcessor

The main processor class for video operations.

#### Constructor

```typescript
new FFmpegProcessor(options?: VideoProcessorOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ffmpegPath` | `string` | `'ffmpeg'` | Path to FFmpeg binary |
| `ffprobePath` | `string` | `'ffprobe'` | Path to FFprobe binary |
| `tempDir` | `string` | system temp | Directory for temp files |
| `timeout` | `number` | `300000` | Processing timeout (ms) |

#### Methods

##### getMetadata

Get video file metadata.

```typescript
async getMetadata(video: Buffer | string): Promise<VideoMetadata>
```

##### extractFrame

Extract a single frame as an image.

```typescript
async extractFrame(
  video: Buffer | string,
  timestamp: number,
  options?: ExtractFrameOptions
): Promise<Buffer>
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | `'jpg' \| 'png' \| 'webp'` | `'jpg'` | Output format |
| `width` | `number` | original | Output width |
| `height` | `number` | original | Output height |
| `quality` | `number` | `85` | JPEG quality (1-100) |

##### compose

Compose video with overlays and audio.

```typescript
async compose(options: ComposeOptions): Promise<Buffer>
```

##### addLowerThird

Add lower-third graphic overlay.

```typescript
async addLowerThird(
  video: Buffer | string,
  config: LowerThirdConfig
): Promise<Buffer>
```

##### transcode

Convert video format and adjust quality.

```typescript
async transcode(
  video: Buffer | string,
  options: TranscodeOptions
): Promise<Buffer>
```

##### addOverlay

Add image or text overlay to video.

```typescript
async addOverlay(
  video: Buffer | string,
  overlay: OverlayConfig
): Promise<Buffer>
```

### Types

```typescript
interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate?: number;
  audioCodec?: string;
  audioBitrate?: number;
  audioSampleRate?: number;
}

interface ComposeOptions {
  baseVideo: Buffer | string;
  audio?: Buffer | string;
  overlays?: OverlayConfig[];
  outputFormat?: VideoFormat;
  quality?: number; // CRF value (lower = better)
}

interface OverlayConfig {
  type: 'image' | 'text';
  content: Buffer | string;
  position: OverlayPosition;
  opacity?: number; // 0-1
  startTime?: number;
  duration?: number;
  fadeIn?: number;
  fadeOut?: number;
  style?: TextOverlayOptions;
}

interface OverlayPosition {
  x: number | 'left' | 'center' | 'right';
  y: number | 'top' | 'center' | 'bottom';
  padding?: number;
}

interface LowerThirdConfig {
  title: string;
  subtitle?: string;
  style?: 'news' | 'minimal' | 'modern';
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  duration?: number;
  startTime?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface TranscodeOptions {
  format: VideoFormat;
  width?: number;
  height?: number;
  video?: VideoCodecOptions;
  audio?: AudioCodecOptions;
}

interface VideoCodecOptions {
  codec: 'h264' | 'h265' | 'vp9' | 'av1';
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  crf?: number; // 0-51 (lower = better quality)
  bitrate?: string; // e.g., '5M'
}

interface AudioCodecOptions {
  codec: 'aac' | 'mp3' | 'opus';
  bitrate?: string; // e.g., '128k'
  sampleRate?: number; // e.g., 48000
}

type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';
```

## Use Cases

### News Video Production Pipeline

```typescript
import { FFmpegProcessor } from '@happyvertical/video';

async function processNewsVideo(rawVideo: string, anchorName: string) {
  const processor = new FFmpegProcessor();

  // 1. Add lower-third with anchor name
  const withLowerThird = await processor.addLowerThird(rawVideo, {
    title: anchorName,
    subtitle: 'News Correspondent',
    style: 'news',
    primaryColor: '#1a237e',
    accentColor: '#c62828',
    duration: 5,
    startTime: 0,
  });

  // 2. Add station logo
  const withLogo = await processor.addOverlay(withLowerThird, {
    type: 'image',
    content: 'station-logo.png',
    position: { x: 'right', y: 'top', padding: 20 },
    opacity: 0.9,
  });

  // 3. Create multiple formats for distribution
  const youtubeShort = await processor.transcode(withLogo, {
    format: 'mp4',
    width: 1080,
    height: 1920,
    video: { codec: 'h264', preset: 'medium', crf: 23 },
  });

  const webVersion = await processor.transcode(withLogo, {
    format: 'mp4',
    width: 1920,
    height: 1080,
    video: { codec: 'h264', preset: 'medium', crf: 20 },
  });

  // 4. Extract thumbnail
  const thumbnail = await processor.extractFrame(withLogo, 2.0, {
    format: 'jpg',
    width: 1280,
    quality: 90,
  });

  return { youtubeShort, webVersion, thumbnail };
}
```

### Batch Thumbnail Generation

```typescript
async function generateThumbnails(videos: string[], timestamps: number[] = [2.0]) {
  const processor = new FFmpegProcessor();
  const thumbnails = [];

  for (const video of videos) {
    for (const timestamp of timestamps) {
      const thumbnail = await processor.extractFrame(video, timestamp, {
        format: 'webp',
        width: 1280,
        quality: 85,
      });
      thumbnails.push({
        video,
        timestamp,
        data: thumbnail,
      });
    }
  }

  return thumbnails;
}
```

## Best Practices

### Memory Management

```typescript
// For large videos, use file paths instead of buffers
const output = await processor.transcode('/path/to/large-video.mp4', {
  format: 'mp4',
  // ...options
});

// Write output to file instead of keeping in memory
fs.writeFileSync('/path/to/output.mp4', output);
```

### Quality vs Size Trade-offs

```typescript
// High quality (larger file)
{ video: { codec: 'h264', preset: 'slow', crf: 18 } }

// Balanced (recommended)
{ video: { codec: 'h264', preset: 'medium', crf: 23 } }

// Fast encoding (lower quality)
{ video: { codec: 'h264', preset: 'fast', crf: 28 } }
```

### Platform-Specific Encoding

```typescript
// YouTube recommended settings
{
  format: 'mp4',
  video: { codec: 'h264', preset: 'slow', crf: 18 },
  audio: { codec: 'aac', bitrate: '384k' },
}

// Twitter/X recommended settings
{
  format: 'mp4',
  video: { codec: 'h264', preset: 'medium', crf: 23 },
  audio: { codec: 'aac', bitrate: '128k' },
}
```

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
