import { describe, expect, it } from 'vitest';
import {
  defaultMediaBundleHandlers,
  genericVideoBundleHandler,
  inspectMediaBundle,
  insta360BundleHandler,
  type MediaBundleHandler,
  type MediaFileDescriptor,
} from './media-bundles/index.js';

const file = (path: string, mimeType?: string): MediaFileDescriptor => ({
  path,
  name: path.split('/').at(-1),
  mimeType,
});

describe('media bundle inspection', () => {
  it('chooses handlers by priority and keeps registration order for ties', async () => {
    const calls: string[] = [];
    const makeHandler = (id: string, priority: number): MediaBundleHandler => ({
      id,
      version: '1.0.0',
      priority,
      supports: () => {
        calls.push(`${id}:supports`);
        return true;
      },
      inspect: async (files) => ({
        handlerId: id,
        handlerVersion: '1.0.0',
        formatFamily: 'unknown',
        primary: files[0],
        supportFiles: [],
        metadata: {},
        capabilities: [],
        warnings: [],
        errors: [],
      }),
    });

    const high = makeHandler('high', 20);
    const first = makeHandler('first', 10);
    const second = makeHandler('second', 10);
    const result = await inspectMediaBundle([file('/tmp/a.bin')], {
      handlers: [first, second, high],
      probe: false,
    });

    expect(result.handlerId).toBe('high');
    expect(calls).toEqual(['high:supports']);

    const tied = await inspectMediaBundle([file('/tmp/a.bin')], {
      handlers: [first, second],
      probe: false,
    });
    expect(tied.handlerId).toBe('first');
  });

  it('lets app-private handlers override or handle unknown formats explicitly', async () => {
    const privateHandler: MediaBundleHandler = {
      id: 'private-format',
      version: '1.0.0',
      priority: 1000,
      capabilities: ['private:closed-format'],
      supports: (files) =>
        files.some((candidate) => candidate.path.endsWith('.private')),
      inspect: async (files) => ({
        handlerId: 'private-format',
        handlerVersion: '1.0.0',
        formatFamily: 'unknown',
        primary: { ...files[0], role: 'primary' },
        supportFiles: [],
        metadata: {
          private: {
            'example.private': { inspected: true },
          },
        },
        capabilities: ['private:closed-format'],
        warnings: [],
        errors: [],
      }),
    };

    const result = await inspectMediaBundle([file('/tmp/camera.private')], {
      handlers: [privateHandler, ...defaultMediaBundleHandlers],
      probe: false,
    });

    expect(result.handlerId).toBe('private-format');
    expect(result.metadata.private?.['example.private']).toEqual({
      inspected: true,
    });
  });

  it('groups default Insta360 INSV/LRV bundles into one visible primary and hidden support files', async () => {
    const result = await inspectMediaBundle(
      [
        file('/tmp/VID_20260418_173449_00_004.insv', 'video/mp4'),
        file('/tmp/VID_20260418_173449_10_004.insv', 'video/mp4'),
        file('/tmp/LRV_20260418_173449_01_004.lrv', 'video/mp4'),
      ],
      {
        handlers: [insta360BundleHandler, genericVideoBundleHandler],
        probe: false,
      },
    );

    expect(result.handlerId).toBe('insta360-insv-lrv');
    expect(result.formatFamily).toBe('insta360');
    expect(result.primary.name).toBe('VID_20260418_173449_00_004.insv');
    expect(result.capabilities).toEqual(
      expect.arrayContaining(['sidecar-binding', 'stitch-export']),
    );
    expect(result.supportFiles).toEqual([
      expect.objectContaining({
        relationship: 'paired-video-stream',
        visibility: 'hidden-retained',
      }),
      expect.objectContaining({
        relationship: 'proxy-video',
        visibility: 'hidden-retained',
      }),
    ]);
  });

  it('does not retain unrelated files as Insta360 support files', async () => {
    const result = await inspectMediaBundle(
      [
        file('/tmp/VID_20260418_173449_00_004.insv', 'video/mp4'),
        file('/tmp/LRV_20260418_173449_01_004.lrv', 'video/mp4'),
        file('/tmp/VID_20260418_180000_00_005.insv', 'video/mp4'),
        file('/tmp/unrelated.mp4', 'video/mp4'),
      ],
      {
        handlers: [insta360BundleHandler, genericVideoBundleHandler],
        probe: false,
      },
    );

    expect(result.primary.name).toBe('VID_20260418_173449_00_004.insv');
    expect(
      result.supportFiles.map((supportFile) => supportFile.file.name),
    ).toEqual(['LRV_20260418_173449_01_004.lrv']);
    expect(
      Object.keys(result.raw?.insta360 as Record<string, unknown>),
    ).toContain('files');
    expect(
      Object.keys(
        (result.raw?.insta360 as { files: Record<string, unknown> }).files,
      ),
    ).toEqual([
      '/tmp/VID_20260418_173449_00_004.insv',
      '/tmp/LRV_20260418_173449_01_004.lrv',
    ]);
  });

  it('falls back to generic video for ordinary video files', async () => {
    const result = await inspectMediaBundle(
      [file('/tmp/news-clip.mp4', 'video/mp4')],
      {
        probe: false,
      },
    );

    expect(result.handlerId).toBe('generic-video');
    expect(result.formatFamily).toBe('generic-video');
    expect(result.primary.role).toBe('primary');
  });
});
