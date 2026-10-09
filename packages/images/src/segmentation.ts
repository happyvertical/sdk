/** Optional browser-only semantic segmentation. Source pixels never leave the device. */
export const SELFIE_MULTICLASS_MODEL = {
  file: 'selfie_multiclass_256x256.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
  sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0',
  license: 'Apache-2.0',
} as const;

/** Pinned MediaPipe face mesh used to locate lips and chin on-device. */
export const FACE_LANDMARKER_MODEL = {
  file: 'face_landmarker.task',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  license: 'Apache-2.0',
} as const;

/** Pinned model is 16,371,837 bytes; leave bounded room for an upstream repack. */
export const MAX_SEGMENTATION_MODEL_BYTES = 17_500_000;
export const MAX_FACE_LANDMARKER_MODEL_BYTES = 4_000_000;

/** Reads a response incrementally and cancels before an oversized body is retained. */
export async function readBoundedModel(
  response: Response,
  limit = MAX_SEGMENTATION_MODEL_BYTES,
): Promise<ArrayBuffer> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error('Segmentation model download limit is invalid.');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new Error(
      'Segmentation model exceeds the download limit. Please retry.',
    );
  }
  if (!response.body)
    throw new Error('Segmentation model response has no body. Please retry.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(
          'Segmentation model exceeds the download limit. Please retry.',
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/** Semantic per-class confidence masks returned by local inference. */
export interface SegmentationMask {
  /** Width shared by every confidence mask, in pixels. */
  width: number;
  /** Height shared by every confidence mask, in pixels. */
  height: number;
  /** Class-indexed, row-major probabilities in the inclusive range 0–1. */
  confidenceMasks: Float32Array[];
}
/** Selects classes and confidence thresholds for alpha-mask generation. */
export interface AlphaMaskOptions {
  /** Distinct class indexes to combine. */
  classes: number[];
  /** Probability at which alpha begins rising; defaults to 0.15. */
  lower?: number;
  /** Probability at which alpha reaches full opacity; defaults to 0.85. */
  upper?: number;
  /** Retain only the largest 8-connected foreground area; defaults to true. */
  largestComponent?: boolean;
}

/**
 * Converts selected semantic class probabilities to a soft, connected alpha mask.
 *
 * @throws {Error} When dimensions, classes, probabilities, or thresholds are invalid,
 * or when no selected foreground remains.
 */
export function segmentationAlpha(
  mask: SegmentationMask,
  options: AlphaMaskOptions,
): Uint8ClampedArray {
  const { width, height, confidenceMasks } = mask;
  const {
    classes,
    lower = 0.15,
    upper = 0.85,
    largestComponent = true,
  } = options;
  const size = width * height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    size > 16_777_216
  )
    throw new Error(
      'Segmentation dimensions must be positive and at most 16 megapixels.',
    );
  if (
    !(lower >= 0 && upper <= 1 && lower < upper) ||
    !classes.length ||
    new Set(classes).size !== classes.length
  )
    throw new Error('Invalid segmentation classes or confidence thresholds.');
  const selected = classes.map((index) => {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      !confidenceMasks[index] ||
      confidenceMasks[index].length !== size
    )
      throw new Error(
        'Segmentation class is missing or has an invalid mask size.',
      );
    return confidenceMasks[index];
  });
  const alpha = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i++) {
    let probability = 0;
    for (const values of selected) {
      const value = values[i];
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error('Invalid segmentation probability.');
      probability += value;
    }
    const t = Math.max(0, Math.min(1, (probability - lower) / (upper - lower)));
    alpha[i] = Math.round(255 * t * t * (3 - 2 * t));
  }
  if (largestComponent) {
    const labels = new Int32Array(size);
    const queue = new Int32Array(size);
    let label = 0,
      bestLabel = 0,
      bestSize = 0;
    for (let seed = 0; seed < size; seed++) {
      if (!alpha[seed] || labels[seed]) continue;
      label++;
      let read = 0,
        write = 1;
      queue[0] = seed;
      labels[seed] = label;
      while (read < write) {
        const at = queue[read++],
          x = at % width,
          y = Math.floor(at / width);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const next = ny * width + nx;
            if (alpha[next] && !labels[next]) {
              labels[next] = label;
              queue[write++] = next;
            }
          }
      }
      if (write > bestSize) {
        bestSize = write;
        bestLabel = label;
      }
    }
    for (let i = 0; i < size; i++) if (labels[i] !== bestLabel) alpha[i] = 0;
  }
  if (!alpha.some((value) => value > 0))
    throw new Error('No selected foreground found. Try a clearer photo.');
  return alpha;
}

/** Configuration for one browser-local segmentation operation. */
export interface SegmentImageOptions {
  /** Same-origin directory containing the pinned model and MediaPipe WASM assets. */
  assetBaseUrl: string;
  /** Cancels loading or prevents inference from starting when already aborted. */
  signal?: AbortSignal;
  /** Receives the current asynchronous stage before inference begins. */
  onProgress?: (stage: 'loading' | 'segmenting') => void;
}

/**
 * Runs CPU-only local inference; the caller owns the decoded original image and result masks.
 *
 * @throws {Error} When the source exceeds the pixel limit, assets cannot be loaded or
 * verified, inference returns no confidence masks, or the supplied signal is aborted.
 */
export async function segmentImage(
  image: ImageData,
  options: SegmentImageOptions,
): Promise<SegmentationMask> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (image.width * image.height > 16_777_216)
    throw new Error('Photo exceeds the 16 megapixel segmentation limit.');
  onProgress?.('loading');
  const base = options.assetBaseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/${SELFIE_MULTICLASS_MODEL.file}`, {
    signal,
    cache: 'force-cache',
  });
  if (!response.ok)
    throw new Error(`Could not load segmentation model (${response.status}).`);
  const bytes = await readBoundedModel(response);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== SELFIE_MULTICLASS_MODEL.sha256)
    throw new Error('Segmentation model integrity check failed.');
  signal?.throwIfAborted();
  const { FilesetResolver, ImageSegmenter } = await import(
    '@mediapipe/tasks-vision'
  );
  const files = await FilesetResolver.forVisionTasks(base);
  signal?.throwIfAborted();
  const segmenter = await ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'CPU' },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  try {
    signal?.throwIfAborted();
    onProgress?.('segmenting');
    // Let the browser paint progress and deliver a pending cancellation before CPU inference.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    const result = segmenter.segment(image);
    try {
      signal?.throwIfAborted();
      if (!result.confidenceMasks?.length)
        throw new Error('Segmentation returned no confidence masks.');
      const first = result.confidenceMasks[0];
      return {
        width: first.width,
        height: first.height,
        confidenceMasks: result.confidenceMasks.map(
          (mask) => new Float32Array(mask.getAsFloat32Array()),
        ),
      };
    } finally {
      result.close();
    }
  } finally {
    segmenter.close();
  }
}

export interface FaceLandmarks {
  mouthLeft: { x: number; y: number };
  mouthRight: { x: number; y: number };
  chin: { x: number; y: number };
}

/** Maps MediaPipe's face-mesh lip-corner and chin indices into UI coordinates. */
export function faceLandmarksFromMesh(
  landmarks: ReadonlyArray<{ x: number; y: number }>,
): FaceLandmarks {
  const mouth = [landmarks[61], landmarks[291]];
  const chin = landmarks[152];
  if (!mouth[0] || !mouth[1] || !chin)
    throw new Error('Face landmarks are incomplete. Try a clearer photo.');
  const point = ({ x, y }: { x: number; y: number }) => {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    )
      throw new Error(
        'Face landmarks fall outside the image. Try a clearer photo.',
      );
    return { x: x * 1000, y: y * 1000 };
  };
  const [first, second] = mouth.map(point).sort((a, b) => a.x - b.x);
  return { mouthLeft: first, mouthRight: second, chin: point(chin) };
}

/**
 * Detects exactly one face locally and returns the visible lip corners and
 * chin in the caller image's 0..1000 coordinate system. Source pixels remain
 * in the browser and the MediaPipe task is always closed after inference.
 */
export async function detectFaceLandmarks(
  image: HTMLImageElement,
  options: SegmentImageOptions,
): Promise<FaceLandmarks> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  onProgress?.('loading');
  const base = options.assetBaseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/${FACE_LANDMARKER_MODEL.file}`, {
    signal,
    cache: 'force-cache',
  });
  if (!response.ok)
    throw new Error(`Could not load face landmark model (${response.status}).`);
  const bytes = await readBoundedModel(
    response,
    MAX_FACE_LANDMARKER_MODEL_BYTES,
  );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== FACE_LANDMARKER_MODEL.sha256)
    throw new Error('Face landmark model integrity check failed.');
  signal?.throwIfAborted();
  const { FaceLandmarker, FilesetResolver } = await import(
    '@mediapipe/tasks-vision'
  );
  const files = await FilesetResolver.forVisionTasks(base);
  signal?.throwIfAborted();
  const landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 2,
  });
  try {
    onProgress?.('segmenting');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    const faces = landmarker.detect(image).faceLandmarks;
    if (faces.length !== 1)
      throw new Error(
        faces.length
          ? 'Use a photo with one clear face.'
          : 'No clear face found. Try a closer, front-facing photo.',
      );
    return faceLandmarksFromMesh(faces[0]);
  } finally {
    landmarker.close();
  }
}

/**
 * Encodes RGBA bytes without canvas premultiplication changing transparent or soft-edge RGB.
 *
 * @throws {Error} When dimensions or the RGBA buffer length are invalid.
 */
export async function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Promise<Blob> {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16_777_216 ||
    rgba.length !== width * height * 4
  )
    throw new Error('Invalid RGBA image dimensions.');
  const chunk = (type: string, data: Uint8Array) => {
    const output = new Uint8Array(data.length + 12),
      view = new DataView(output.buffer);
    view.setUint32(0, data.length);
    output.set(new TextEncoder().encode(type), 4);
    output.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < data.length + 8; i++) {
      crc ^= output[i];
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0);
    return output;
  };
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  return new Blob(
    [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', compressed),
      chunk('IEND', new Uint8Array()),
    ],
    { type: 'image/png' },
  );
}
