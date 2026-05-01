import { execFile as execFileCallback } from 'node:child_process';
import { basename, extname } from 'node:path';
import { promisify } from 'node:util';

import type {
  MediaFileDescriptor,
  NormalizedGpsTrackPoint,
  NormalizedMediaDevice,
  NormalizedMediaMetadata,
  NormalizedMediaStream,
} from './types.js';

const execFile = promisify(execFileCallback);
const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.webm',
  '.insv',
  '.lrv',
]);
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.tif',
  '.tiff',
  '.heic',
  '.insp',
]);

export function displayName(file: MediaFileDescriptor): string {
  return file.name || basename(file.relativePath || file.path);
}

export function fileExtension(file: MediaFileDescriptor): string {
  return extname(displayName(file)).toLowerCase();
}

export function isVideoFile(file: MediaFileDescriptor): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  return mime.startsWith('video/') || VIDEO_EXTENSIONS.has(fileExtension(file));
}

export function isImageFile(file: MediaFileDescriptor): boolean {
  const mime = (file.mimeType || '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension(file));
}

export async function runJsonCommand(
  bin: string,
  args: string[],
): Promise<Record<string, unknown>> {
  const { stdout } = await execFile(bin, args, {
    maxBuffer: 100 * 1024 * 1024,
  });
  return JSON.parse(stdout || '{}') as Record<string, unknown>;
}

export async function runJsonArrayCommand(
  bin: string,
  args: string[],
): Promise<unknown[]> {
  const { stdout } = await execFile(bin, args, {
    maxBuffer: 100 * 1024 * 1024,
  });
  return JSON.parse(stdout || '[]') as unknown[];
}

export async function probeVideoMetadata(
  file: MediaFileDescriptor,
  ffprobePath = 'ffprobe',
): Promise<NormalizedMediaMetadata> {
  const probe = await runJsonCommand(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    file.path,
  ]);
  const format = isRecord(probe.format) ? probe.format : {};
  const streams = Array.isArray(probe.streams)
    ? probe.streams.filter(isRecord)
    : [];
  const normalizedStreams = streams.map(normalizeFfprobeStream);
  const videoStream = normalizedStreams.find(
    (stream) => stream.kind === 'video',
  );
  const tags = isRecord(format.tags) ? format.tags : {};
  const durationMs = toDurationMs(format.duration);

  return {
    captureTime:
      parseDateString(String(tags.creation_time || tags.CreateDate || '')) ??
      null,
    width: videoStream?.width,
    height: videoStream?.height,
    durationMs,
    mimeType: file.mimeType,
    streams: normalizedStreams,
    raw: { ffprobe: probe },
  };
}

export async function probeEmbeddedMetadata(
  file: MediaFileDescriptor,
  exiftoolPath = 'exiftool',
): Promise<NormalizedMediaMetadata> {
  const rows = await runJsonArrayCommand(exiftoolPath, [
    '-ee',
    '-G3:1',
    '-json',
    '-n',
    file.path,
  ]);
  const row = rows[0] && isRecord(rows[0]) ? rows[0] : {};
  const flat = flattenExiftoolRecord(row);
  const device = readDevice(flat);
  const gpsTrack = parseExiftoolGpsRecord(row, file.path);
  const captureTime =
    flat.DateTimeOriginal ||
    flat.CreateDate ||
    flat.MediaCreateDate ||
    flat.GPSDateTime ||
    '';
  return {
    captureTime: parseDateString(String(captureTime)) ?? null,
    device,
    width: toInteger(flat.ImageWidth ?? flat.ExifImageWidth),
    height: toInteger(flat.ImageHeight ?? flat.ExifImageHeight),
    gpsTrack,
    raw: { exiftool: row },
  };
}

export function mergeMetadata(
  primary: NormalizedMediaMetadata,
  fallback: NormalizedMediaMetadata,
): NormalizedMediaMetadata {
  return {
    captureTime: primary.captureTime ?? fallback.captureTime,
    device: {
      ...fallback.device,
      ...primary.device,
    },
    width: primary.width ?? fallback.width,
    height: primary.height ?? fallback.height,
    durationMs: primary.durationMs ?? fallback.durationMs,
    mimeType: primary.mimeType ?? fallback.mimeType,
    streams:
      primary.streams && primary.streams.length > 0
        ? primary.streams
        : fallback.streams,
    gpsTrack:
      primary.gpsTrack && primary.gpsTrack.length > 0
        ? primary.gpsTrack
        : fallback.gpsTrack,
    raw: {
      ...fallback.raw,
      ...primary.raw,
    },
    private: {
      ...fallback.private,
      ...primary.private,
    },
  };
}

function normalizeFfprobeStream(
  stream: Record<string, unknown>,
): NormalizedMediaStream {
  const kind = String(
    stream.codec_type || 'unknown',
  ) as NormalizedMediaStream['kind'];
  return {
    kind: ['video', 'audio', 'data'].includes(kind) ? kind : 'unknown',
    codec: readString(stream.codec_name),
    width: toInteger(stream.width),
    height: toInteger(stream.height),
    fps: parseFrameRate(readString(stream.r_frame_rate)),
    durationMs: toDurationMs(stream.duration),
    bitrate: toInteger(stream.bit_rate),
    metadata: stream,
  };
}

function flattenExiftoolRecord(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value;
    const suffix = key.split(':').at(-1);
    if (suffix && !(suffix in out)) out[suffix] = value;
  }
  return out;
}

function readDevice(
  row: Record<string, unknown>,
): NormalizedMediaDevice | undefined {
  const model = readString(row.Model);
  const make = readString(row.Make) || inferMake(model);
  const serialNumber = readString(row.SerialNumber);
  const firmwareVersion = readString(row.Firmware);
  if (!make && !model && !serialNumber && !firmwareVersion) return undefined;
  return { make, model, serialNumber, firmwareVersion };
}

function inferMake(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const vendors = [
    'Insta360',
    'GoPro',
    'DJI',
    'Sony',
    'Canon',
    'Nikon',
    'Ricoh',
    'Panasonic',
    'Fujifilm',
  ];
  const lowered = model.toLowerCase();
  return vendors.find((vendor) => lowered.startsWith(vendor.toLowerCase()));
}

export function parseExiftoolGpsRecord(
  row: Record<string, unknown>,
  sourceFilePath?: string,
): NormalizedGpsTrackPoint[] {
  const grouped = new Map<string, Record<string, unknown>>();
  const mainFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const docMatch = /^(Doc\d+):[^:]+:(\w+)$/.exec(key);
    if (docMatch) {
      const bucket = grouped.get(docMatch[1]) ?? {};
      bucket[docMatch[2]] = value;
      grouped.set(docMatch[1], bucket);
      continue;
    }
    const mainMatch = /^Main:[^:]+:(\w+)$/.exec(key);
    if (mainMatch) mainFields[mainMatch[1]] = value;
  }

  const out: NormalizedGpsTrackPoint[] = [];
  let firstEpochMs: number | null = null;
  let lastLat: number | null = null;
  let lastLon: number | null = null;
  for (const docId of [...grouped.keys()].sort(compareDocIds)) {
    const record = grouped.get(docId);
    if (!record) continue;
    const lat = toNumber(record.GPSLatitude);
    const lon = toNumber(record.GPSLongitude);
    const epochMs =
      record.GPSDateTime == null
        ? null
        : parseDateMs(String(record.GPSDateTime));
    if (lat == null || lon == null || epochMs == null) continue;
    if (firstEpochMs == null) firstEpochMs = epochMs;
    if (lat === lastLat && lon === lastLon) continue;
    lastLat = lat;
    lastLon = lon;
    out.push({
      tSeconds: Math.max(0, (epochMs - firstEpochMs) / 1000),
      recordedAt: new Date(epochMs),
      latitude: lat,
      longitude: lon,
      altitude: toNumber(record.GPSAltitude),
      heading: toNumber(record.GPSTrack),
      speedMps: toNumber(record.GPSSpeed),
      sourceFilePath,
    });
  }
  if (out.length > 0) return out;

  const flat = flattenExiftoolRecord(row);
  const fallback = Object.keys(mainFields).length > 0 ? mainFields : flat;
  const lat = toNumber(fallback.GPSLatitude);
  const lon = toNumber(fallback.GPSLongitude);
  const epochMs =
    fallback.GPSDateTime == null
      ? null
      : parseDateMs(String(fallback.GPSDateTime));
  if (lat == null || lon == null || epochMs == null) return [];
  return [
    {
      tSeconds: 0,
      recordedAt: new Date(epochMs),
      latitude: lat,
      longitude: lon,
      altitude: toNumber(fallback.GPSAltitude),
      heading: toNumber(fallback.GPSTrack ?? fallback.GPSImgDirection),
      speedMps: toNumber(fallback.GPSSpeed),
      sourceFilePath,
    },
  ];
}

function compareDocIds(left: string, right: string): number {
  return Number(left.replace(/\D+/g, '')) - Number(right.replace(/\D+/g, ''));
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const [num, den] = value.split('/').map(Number);
  const fps = den ? num / den : num;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

function toDurationMs(value: unknown): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * 1000)
    : undefined;
}

function toInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseDateString(value: string): string | null {
  const ms = parseDateMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}

function parseDateMs(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  if (!normalized) return null;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
