import { describe, expect, it } from 'vitest';
import {
  encodeRgbaPng,
  readBoundedModel,
  segmentationAlpha,
  segmentImage,
} from './segmentation.js';

describe('bounded segmentation model downloads', () => {
  it('cancels declared and streamed overflow without retaining bytes, then accepts a retry', async () => {
    let cancelled = 0;
    const declared = new Response(
      new ReadableStream({
        cancel: () => {
          cancelled++;
        },
      }),
      { headers: { 'content-length': '17' } },
    );
    await expect(readBoundedModel(declared, 16)).rejects.toThrow(/exceeds/);
    expect(cancelled).toBe(1);
    let streamedCancelled = 0;
    const streamed = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(9));
        },
        cancel: () => {
          streamedCancelled++;
        },
      }),
    );
    await expect(readBoundedModel(streamed, 16)).rejects.toThrow(/exceeds/);
    expect(streamedCancelled).toBe(1);
    await expect(
      readBoundedModel(new Response(new Uint8Array(16)), 16),
    ).resolves.toHaveProperty('byteLength', 16);
  });
  it('rejects invalid limits rather than bypassing the bound', async () => {
    await expect(
      readBoundedModel(new Response(new Uint8Array(1)), Number.NaN),
    ).rejects.toThrow();
  });
});

import { segmentationAssetPath } from './segmentation-assets.js';

describe('semantic alpha mask', () => {
  it('combines chosen classes with smooth alpha and retains the largest 8-connected component', () => {
    const mask = {
      width: 4,
      height: 2,
      confidenceMasks: [
        new Float32Array([1, 0, 0, 0, 0, 0, 0, 1]),
        new Float32Array([0, 0.5, 0, 0, 0, 0, 0, 0]),
      ],
    };
    expect([...segmentationAlpha(mask, { classes: [0, 1] })]).toEqual([
      255, 128, 0, 0, 0, 0, 0, 0,
    ]);
    expect(mask.confidenceMasks[0][7]).toBe(1);
  });
  it('rejects malformed masks, unknown classes, probabilities, dimensions and empty foreground', () => {
    const valid = {
      width: 1,
      height: 1,
      confidenceMasks: [new Float32Array([1])],
    };
    expect(() => segmentationAlpha(valid, { classes: [2] })).toThrow(/missing/);
    expect(() => segmentationAlpha(valid, { classes: [0, 0] })).toThrow(
      /Invalid/,
    );
    expect(() =>
      segmentationAlpha(valid, { classes: [0], lower: 0.9, upper: 0.1 }),
    ).toThrow(/Invalid/);
    expect(() =>
      segmentationAlpha({ ...valid, width: 2 }, { classes: [0] }),
    ).toThrow(/size/);
    expect(() =>
      segmentationAlpha({ ...valid, width: 0 }, { classes: [0] }),
    ).toThrow(/dimensions/);
    expect(() =>
      segmentationAlpha(
        { ...valid, confidenceMasks: [new Float32Array([NaN])] },
        { classes: [0] },
      ),
    ).toThrow(/probability/);
    expect(() =>
      segmentationAlpha(
        { ...valid, confidenceMasks: [new Float32Array([0])] },
        { classes: [0] },
      ),
    ).toThrow(/No selected/);
  });
});

it('encodes original RGB exactly even in transparent and partially transparent pixels', async () => {
  const { default: sharp } = await import('sharp');
  const rgba = new Uint8ClampedArray([
    123, 45, 67, 0, 234, 56, 78, 128, 12, 34, 56, 255,
  ]);
  const png = await encodeRgbaPng(3, 1, rgba);
  const decoded = await sharp(Buffer.from(await png.arrayBuffer()))
    .raw()
    .toBuffer();
  expect([...decoded]).toEqual([...rgba]);
});

it('rejects invalid RGBA buffers before encoding', async () => {
  await expect(encodeRgbaPng(0, 1, new Uint8ClampedArray())).rejects.toThrow(
    /Invalid/,
  );
  await expect(
    encodeRgbaPng(1, 1, new Uint8ClampedArray([1, 2, 3])),
  ).rejects.toThrow(/Invalid/);
});

it('rejects an unverified model before loading the local inference runtime', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
  try {
    await expect(
      segmentImage({ width: 1, height: 1 } as ImageData, {
        assetBaseUrl: '/segmentation-assets',
      }),
    ).rejects.toThrow(/integrity/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it('honors an already-aborted request before any asset fetch', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    segmentImage({ width: 1, height: 1 } as ImageData, {
      assetBaseUrl: '/segmentation-assets',
      signal: controller.signal,
    }),
  ).rejects.toThrow(/abort/i);
});

it('allows only fixed local runtime asset names', () => {
  expect(() => segmentationAssetPath('../private-photo.jpg')).toThrow(
    /Unknown/,
  );
  expect(() => segmentationAssetPath('other-model.tflite')).toThrow(/Unknown/);
});
