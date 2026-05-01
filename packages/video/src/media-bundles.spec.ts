import { describe, expect, it } from 'vitest';
import {
  defaultMediaBundleHandlers,
  genericVideoBundleHandler,
  inspectMediaBundle,
  insta360BundleHandler,
  type MediaBundleHandler,
  type MediaFileDescriptor,
} from './media-bundles/index.js';
import { parseExiftoolGpsRecord } from './media-bundles/utils.js';

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

  it('appends validate hook warnings to a matched inspection', async () => {
    const result = await inspectMediaBundle([file('/tmp/a.bin')], {
      handlers: [
        {
          id: 'validator',
          version: '1.0.0',
          priority: 1,
          supports: () => true,
          inspect: async (files) => ({
            handlerId: 'validator',
            handlerVersion: '1.0.0',
            formatFamily: 'unknown',
            primary: { ...files[0], role: 'primary' },
            supportFiles: [],
            metadata: {},
            capabilities: [],
            warnings: ['existing warning'],
            errors: [],
          }),
          validate: () => ['validation warning'],
        },
      ],
    });

    expect(result.warnings).toEqual(['existing warning', 'validation warning']);
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
    expect(result.warnings).toEqual([
      'ignored 2 file(s) outside Insta360 bundle 20260418_173449_004: VID_20260418_180000_00_005.insv, unrelated.mp4',
      'probe disabled; returning file-level Insta360 bundle inspection',
    ]);
    expect(
      (result.raw?.insta360 as { ignoredFiles: unknown[] }).ignoredFiles,
    ).toHaveLength(2);
  });

  it('returns an unknown inspection when no handler matches', async () => {
    const result = await inspectMediaBundle([file('/tmp/readme.txt')], {
      handlers: [],
    });

    expect(result.handlerId).toBe('unknown');
    expect(result.primary.role).toBe('primary');
    expect(result.warnings).toEqual([
      'no media bundle handler matched; returned unknown inspection',
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

describe('parseExiftoolGpsRecord', () => {
  it('normalizes Doc-grouped GPS samples into a deduped relative track', () => {
    const points = parseExiftoolGpsRecord(
      {
        'Main:QuickTime:GPSLatitude': 1,
        'Main:QuickTime:GPSLongitude': 2,
        'Main:QuickTime:GPSDateTime': '2026:04:18 17:34:40Z',
        'Doc2:QuickTime:GPSLatitude': 52.2,
        'Doc2:QuickTime:GPSLongitude': -114.2,
        'Doc2:QuickTime:GPSDateTime': '2026:04:18 17:34:51Z',
        'Doc2:QuickTime:GPSAltitude': 940,
        'Doc2:QuickTime:GPSTrack': 180,
        'Doc2:QuickTime:GPSSpeed': 4.5,
        'Doc1:QuickTime:GPSLatitude': 52.1,
        'Doc1:QuickTime:GPSLongitude': -114.1,
        'Doc1:QuickTime:GPSDateTime': '2026:04:18 17:34:50Z',
        'Doc3:QuickTime:GPSLatitude': 52.2,
        'Doc3:QuickTime:GPSLongitude': -114.2,
        'Doc3:QuickTime:GPSDateTime': '2026:04:18 17:34:52Z',
      },
      '/tmp/LRV_20260418_173449_01_004.lrv',
    );

    expect(points).toEqual([
      {
        tSeconds: 0,
        recordedAt: '2026-04-18T17:34:50.000Z',
        latitude: 52.1,
        longitude: -114.1,
        altitude: null,
        heading: null,
        speedMps: null,
        sourceFilePath: '/tmp/LRV_20260418_173449_01_004.lrv',
      },
      {
        tSeconds: 1,
        recordedAt: '2026-04-18T17:34:51.000Z',
        latitude: 52.2,
        longitude: -114.2,
        altitude: 940,
        heading: 180,
        speedMps: 4.5,
        sourceFilePath: '/tmp/LRV_20260418_173449_01_004.lrv',
      },
    ]);
  });

  it('falls back to a single Main or flat GPS fix when Doc groups are absent', () => {
    expect(
      parseExiftoolGpsRecord({
        'Main:QuickTime:GPSLatitude': 52.468,
        'Main:QuickTime:GPSLongitude': -114.043,
        'Main:QuickTime:GPSDateTime': '2026:04:18 17:34:50Z',
        'Main:QuickTime:GPSAltitude': 930,
      }),
    ).toEqual([
      {
        tSeconds: 0,
        recordedAt: '2026-04-18T17:34:50.000Z',
        latitude: 52.468,
        longitude: -114.043,
        altitude: 930,
        heading: null,
        speedMps: null,
        sourceFilePath: undefined,
      },
    ]);

    expect(
      parseExiftoolGpsRecord(
        Object.fromEntries([
          ['GPSLatitude', 52.469],
          ['GPSLongitude', -114.044],
          ['GPSDateTime', '2026:04:18 17:34:51Z'],
          ['GPSImgDirection', 45],
        ]),
      ),
    ).toEqual([
      {
        tSeconds: 0,
        recordedAt: '2026-04-18T17:34:51.000Z',
        latitude: 52.469,
        longitude: -114.044,
        altitude: null,
        heading: 45,
        speedMps: null,
        sourceFilePath: undefined,
      },
    ]);
  });
});
