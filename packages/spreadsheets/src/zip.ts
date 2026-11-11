import {
  inspectZipManifest,
  ZipManifestError,
} from '@happyvertical/files/archive';
import { Inflate } from 'fflate/browser';
import {
  checkLimit,
  SpreadsheetError,
  type SpreadsheetLimits,
} from './errors.js';

// The shared archive subpath is browser-safe; redact its path-bearing errors.
export function unzipBounded(
  bytes: Uint8Array,
  limits: SpreadsheetLimits,
): Map<string, Uint8Array> {
  try {
    checkLimit(bytes.length, 'maxInputBytes', limits);
    const manifest = inspectZipManifest(bytes, {
      maxEntries: limits.maxEntries,
      maxEntryUncompressedBytes: limits.maxEntryBytes,
      maxTotalUncompressedBytes: limits.maxTotalBytes,
      maxPathBytes: limits.maxPathBytes,
    });
    for (const entry of manifest.entries) {
      if (
        entry.size >
        Math.max(1, entry.compressedSize) * limits.maxCompressionRatio
      )
        throw new SpreadsheetError(
          'LIMIT_EXCEEDED',
          'ZIP compression ratio exceeds limit.',
          'maxCompressionRatio',
        );
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
        throw new SpreadsheetError(
          'UNSUPPORTED_ZIP',
          'Unsupported ZIP compression method.',
        );
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const output = new Map<string, Uint8Array>();
    let end = bytes.length - 22;
    while (
      end >= 0 &&
      (view.getUint32(end, true) !== 0x06054b50 ||
        end + 22 + view.getUint16(end + 20, true) !== bytes.length)
    )
      end--;
    if (end < 0)
      throw new SpreadsheetError('INVALID_ZIP', 'Missing ZIP end record.');
    let central = view.getUint32(end + 16, true);
    let total = 0;
    for (const entry of manifest.entries) {
      const offset = view.getUint32(central + 42, true);
      const nameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const start = offset + 30 + nameLength + extraLength;
      const compressed = bytes.subarray(start, start + entry.compressedSize);
      const chunks: Uint8Array[] = [];
      let size = 0;
      const ondata = (chunk: Uint8Array) => {
        size += chunk.length;
        total += chunk.length;
        checkLimit(size, 'maxEntryBytes', limits);
        checkLimit(total, 'maxTotalBytes', limits);
        if (size > entry.size)
          throw new SpreadsheetError(
            'INVALID_ZIP',
            'ZIP inflated size differs from manifest.',
          );
        chunks.push(chunk);
      };
      if (entry.compressionMethod === 0) ondata(compressed);
      else {
        const inflater = new Inflate(ondata);
        // A small input quantum bounds temporary DEFLATE output even for forged sizes.
        for (let p = 0; p < compressed.length; p += 256)
          inflater.push(
            compressed.subarray(p, p + 256),
            p + 256 >= compressed.length,
          );
        if (compressed.length === 0)
          throw new SpreadsheetError('INVALID_ZIP', 'Empty DEFLATE stream.');
      }
      if (size !== entry.size)
        throw new SpreadsheetError(
          'INVALID_ZIP',
          'ZIP inflated size differs from manifest.',
        );
      const data = new Uint8Array(size);
      let p = 0;
      for (const chunk of chunks) {
        data.set(chunk, p);
        p += chunk.length;
      }
      // The manifest validates local/central CRC agreement; also verify content.
      if (crc32(data) !== view.getUint32(central + 16, true))
        throw new SpreadsheetError('INVALID_ZIP', 'ZIP checksum mismatch.');
      output.set(entry.path, data);
      central +=
        46 +
        view.getUint16(central + 28, true) +
        view.getUint16(central + 30, true) +
        view.getUint16(central + 32, true);
    }
    return output;
  } catch (error) {
    if (error instanceof SpreadsheetError) throw error;
    if (error instanceof ZipManifestError) {
      const code =
        error.code === 'ZIP_LIMIT_EXCEEDED'
          ? 'LIMIT_EXCEEDED'
          : error.code === 'ZIP_UNSAFE_ENTRY'
            ? 'UNSAFE_ZIP'
            : error.code === 'ZIP_UNSUPPORTED_FEATURE'
              ? 'UNSUPPORTED_ZIP'
              : 'INVALID_ZIP';
      throw new SpreadsheetError(
        code,
        'Invalid, unsafe or oversized ZIP archive.',
      );
    }
    throw new SpreadsheetError('INVALID_ZIP', 'Invalid ZIP archive.');
  }
}
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
