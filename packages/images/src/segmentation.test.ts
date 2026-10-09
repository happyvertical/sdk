import { describe, expect, it, vi } from 'vitest';

const detect = vi.fn();
const close = vi.fn();
const createFromOptions = vi.fn(async () => ({ detect, close }));
const forVisionTasks = vi.fn(async () => ({}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: { createFromOptions },
  FilesetResolver: { forVisionTasks },
}));

import {
  detectFaceLandmarks,
  encodeRgbaPng,
  faceLandmarksFromMesh,
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

describe('face landmark mapping', () => {
  it('maps lip corners and chin from the face mesh into normalized image coordinates', () => {
    const mesh = Array.from({ length: 292 }, () => ({ x: 0, y: 0 }));
    mesh[61] = { x: 0.7, y: 0.8 };
    mesh[291] = { x: 0.3, y: 0.79 };
    mesh[152] = { x: 0.5, y: 0.94 };
    expect(faceLandmarksFromMesh(mesh)).toEqual({
      mouthLeft: { x: 300, y: 790 },
      mouthRight: { x: 700, y: 800 },
      chin: { x: 500, y: 940 },
    });
  });
  it('fails closed when MediaPipe does not return a complete face mesh', () => {
    expect(() => faceLandmarksFromMesh([])).toThrow('incomplete');
  });
  it('accepts image boundaries but rejects invalid landmark coordinates', () => {
    const mesh = Array.from({ length: 292 }, () => ({ x: 0.5, y: 0.5 }));
    mesh[61] = { x: 0, y: 0 };
    mesh[291] = { x: 1, y: 1 };
    mesh[152] = { x: 0, y: 1 };
    expect(faceLandmarksFromMesh(mesh)).toEqual({
      mouthLeft: { x: 0, y: 0 },
      mouthRight: { x: 1000, y: 1000 },
      chin: { x: 0, y: 1000 },
    });

    for (const point of [
      { x: -0.01, y: 0.5 },
      { x: 1.01, y: 0.5 },
      { x: Number.NaN, y: 0.5 },
      { x: 0.5, y: Number.POSITIVE_INFINITY },
    ]) {
      mesh[61] = point;
      expect(() => faceLandmarksFromMesh(mesh)).toThrow('outside the image');
    }
  });
});

describe('local face landmark inference lifecycle', () => {
  const assetBaseUrl = '/segmentation-assets';
  const image = {} as HTMLImageElement;
  const model = new Uint8Array([42]);
  const verifiedDigest = Uint8Array.from(
    '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'.match(
      /../g,
    )!,
    (byte) => Number.parseInt(byte, 16),
  );
  const digest = vi.spyOn(crypto.subtle, 'digest');
  const mesh = () => {
    const points = Array.from({ length: 292 }, () => ({ x: 0, y: 0 }));
    points[61] = { x: 0.3, y: 0.8 };
    points[291] = { x: 0.7, y: 0.8 };
    points[152] = { x: 0.5, y: 0.94 };
    return points;
  };
  const originalFetch = globalThis.fetch;

  function resetWithModel() {
    detect.mockReset();
    close.mockReset();
    createFromOptions.mockReset();
    createFromOptions.mockResolvedValue({ detect, close });
    forVisionTasks.mockReset();
    forVisionTasks.mockResolvedValue({});
    digest.mockResolvedValue(verifiedDigest.buffer as ArrayBuffer);
  }

  it('refuses a bad face model before initializing MediaPipe', async () => {
    resetWithModel();
    digest.mockResolvedValue(new ArrayBuffer(32));
    globalThis.fetch = vi.fn(async () => new Response(model));
    try {
      await expect(
        detectFaceLandmarks(image, { assetBaseUrl }),
      ).rejects.toThrow(/integrity/);
      expect(createFromOptions).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects no detected face and closes the task', async () => {
    resetWithModel();
    globalThis.fetch = vi.fn(async () => new Response(model));
    detect.mockReturnValue({ faceLandmarks: [] });
    try {
      await expect(
        detectFaceLandmarks(image, { assetBaseUrl }),
      ).rejects.toThrow('No clear face');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects multiple detected faces and closes the task', async () => {
    resetWithModel();
    globalThis.fetch = vi.fn(async () => new Response(model));
    detect.mockReturnValue({ faceLandmarks: [mesh(), mesh()] });
    try {
      await expect(
        detectFaceLandmarks(image, { assetBaseUrl }),
      ).rejects.toThrow('one clear face');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('closes the task when detection throws and honors cancellation after initialization', async () => {
    resetWithModel();
    globalThis.fetch = vi.fn(async () => new Response(model));
    detect.mockImplementation(() => {
      throw new Error('detector failed');
    });
    try {
      await expect(
        detectFaceLandmarks(image, { assetBaseUrl }),
      ).rejects.toThrow('detector failed');
      expect(close).toHaveBeenCalledOnce();

      resetWithModel();
      const controller = new AbortController();
      createFromOptions.mockImplementationOnce(async () => {
        controller.abort();
        return { detect, close };
      });
      await expect(
        detectFaceLandmarks(image, { assetBaseUrl, signal: controller.signal }),
      ).rejects.toThrow(/abort/i);
      expect(detect).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
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
