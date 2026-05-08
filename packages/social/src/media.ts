export interface ResolvedMediaData {
  data: Buffer;
  mimeType: string;
}

export async function resolveMediaData(
  file: Buffer | string,
  options: {
    explicitMimeType?: string;
    fallbackMimeType?: string;
  } = {},
): Promise<ResolvedMediaData> {
  const explicitMimeType = normalizeMimeType(options.explicitMimeType);

  if (Buffer.isBuffer(file)) {
    return {
      data: file,
      mimeType:
        explicitMimeType ??
        detectMimeType(file) ??
        options.fallbackMimeType ??
        'application/octet-stream',
    };
  }

  const response = await fetch(file);
  const data = Buffer.from(await response.arrayBuffer());

  return {
    data,
    mimeType:
      explicitMimeType ??
      normalizeMimeType(response.headers.get('content-type')) ??
      detectMimeType(data) ??
      options.fallbackMimeType ??
      'application/octet-stream',
  };
}

export function normalizeMimeType(value?: string | null): string | undefined {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase();
  if (!mimeType || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) {
    return undefined;
  }

  return mimeType;
}

function detectMimeType(data: Buffer): string | undefined {
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return 'image/jpeg';
  }

  const header = data.subarray(0, 12).toString('ascii');
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif';
  }

  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp';
  }

  if (data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = data.subarray(8, 12).toString('ascii');
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }

  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  ) {
    return 'video/webm';
  }

  return undefined;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
