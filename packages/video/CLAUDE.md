# @happyvertical/video

Video composition, transcoding, and frame extraction. Adapter: `FFmpegProcessor`.

## Adapters

- **ffmpeg** -- Wraps FFmpeg/FFprobe CLI binaries; uses `sharp` for animated WebP frame extraction

## Key patterns

- `VideoProcessor` interface: `compose()`, `transcode()`, `extractFrame()`, `addOverlay()`, `addLowerThird()`, `concatenate()`, `mixAudio()`, `getMetadata()`
- `compose()` combines base video + audio + image/text/video overlays in one call
- Lower-third templates: `minimal`, `news`, `corporate`, `gradient` styles
- All methods accept `Buffer | string` (path) for video/audio inputs, return `Buffer`

## Gotchas

- Requires `ffmpeg` and `ffprobe` on `PATH` (or set `ffmpegPath` / `ffprobePath` in options)
- Default operation timeout is 5 minutes (300000ms)
- `convertWebpToMp4` is optional on the interface (uses `sharp` to decode frames ffmpeg cannot)
- CRF quality scale: lower = better quality (default 23 for h264); `transcode()` quality param is CRF
- Audio mix `mode: 'replace'` is the default; use `'mix'` to blend original + new audio
