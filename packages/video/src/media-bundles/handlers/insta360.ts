import type {
  MediaBundleHandler,
  MediaBundleInspection,
  MediaBundleSupportFile,
  MediaFileDescriptor,
  NormalizedMediaMetadata,
} from '../types.js';
import {
  displayName,
  fileExtension,
  formatError,
  mergeMetadata,
  probeEmbeddedMetadata,
  probeVideoMetadata,
} from '../utils.js';

export interface Insta360FileIdentity {
  prefix: 'VID' | 'LRV';
  date: string;
  time: string;
  streamIndex: string;
  sequence: string;
  extension: string;
  bundleKey: string;
}

const INSTA360_RE = /^(VID|LRV)_(\d{8})_(\d{6})_(\d{2})_(\d+)\.(insv|lrv)$/i;

export const insta360BundleHandler: MediaBundleHandler = {
  id: 'insta360-insv-lrv',
  version: '1.0.0',
  priority: 100,
  capabilities: ['sidecar-binding', 'stitch-export', 'stream-info'],

  supports(files) {
    return files.some((file) => parseInsta360FileName(file));
  },

  async inspect(files, context): Promise<MediaBundleInspection> {
    const parsedByPath = new Map(
      files.map((file) => [file.path, parseInsta360FileName(file)] as const),
    );
    const bundleKey = chooseBundleKey(files, parsedByPath);
    const bundleFiles = files.filter((file) => {
      const parsed = parsedByPath.get(file.path);
      return Boolean(parsed && (!bundleKey || parsed.bundleKey === bundleKey));
    });
    const ignoredFiles = files.filter((file) => !bundleFiles.includes(file));
    const primary = choosePrimary(bundleFiles, parsedByPath);
    const warnings: string[] = [];
    if (ignoredFiles.length > 0) {
      warnings.push(
        `ignored ${ignoredFiles.length} file(s) outside Insta360 bundle ${bundleKey ?? 'unknown'}: ${ignoredFiles
          .map(displayName)
          .join(', ')}`,
      );
    }
    let metadata: NormalizedMediaMetadata = {
      mimeType: primary.mimeType,
      private: {
        'happyvertical.video.insta360': {
          primary: parsedByPath.get(primary.path) ?? null,
          supportFiles: bundleFiles
            .filter((file) => file !== primary)
            .map((file) => parsedByPath.get(file.path) ?? null),
        },
      },
    };

    const nonPrimaryBundleFiles = bundleFiles.filter(
      (file) => file !== primary,
    );
    const supportFiles: MediaBundleSupportFile[] = await Promise.all(
      nonPrimaryBundleFiles.map(async (file) => {
        const parsed = parsedByPath.get(file.path);
        let supportMetadata: NormalizedMediaMetadata | undefined;
        if (context.probe !== false) {
          try {
            supportMetadata = await probeEmbeddedMetadata(
              file,
              context.tools?.exiftoolPath,
            );
          } catch (error) {
            warnings.push(
              `exiftool failed for support file ${displayName(file)}: ${formatError(error)}`,
            );
          }
        }
        return {
          file: { ...file, role: 'support' },
          role: 'support',
          relationship: relationshipForInsta360SupportFile(file, parsed),
          visibility: context.defaultSupportFileVisibility ?? 'hidden-retained',
          metadata: supportMetadata,
        } satisfies MediaBundleSupportFile;
      }),
    );

    if (context.probe === false) {
      warnings.push(
        'probe disabled; returning file-level Insta360 bundle inspection',
      );
    } else {
      try {
        metadata = mergeMetadata(
          await probeVideoMetadata(primary, context.tools?.ffprobePath),
          metadata,
        );
      } catch (error) {
        warnings.push(
          `ffprobe failed for primary ${displayName(primary)}: ${formatError(error)}`,
        );
      }

      try {
        metadata = mergeMetadata(
          await probeEmbeddedMetadata(primary, context.tools?.exiftoolPath),
          metadata,
        );
      } catch (error) {
        warnings.push(
          `exiftool failed for primary ${displayName(primary)}: ${formatError(error)}`,
        );
      }
    }

    if (!metadata.gpsTrack || metadata.gpsTrack.length === 0) {
      const supportGps = supportFiles
        .map((support) => support.metadata)
        .find(
          (candidate) => candidate?.gpsTrack && candidate.gpsTrack.length > 0,
        );
      if (supportGps) {
        metadata = { ...metadata, gpsTrack: supportGps.gpsTrack };
      }
    }

    const capabilities = new Set(insta360BundleHandler.capabilities);
    if (metadata.gpsTrack && metadata.gpsTrack.length > 0)
      capabilities.add('gps-track');

    return {
      handlerId: insta360BundleHandler.id,
      handlerVersion: insta360BundleHandler.version,
      formatFamily: 'insta360',
      primary: { ...primary, role: 'primary' },
      supportFiles,
      metadata,
      capabilities: [...capabilities],
      warnings,
      errors: [],
      raw: {
        insta360: {
          bundleKey,
          files: Object.fromEntries(
            bundleFiles.map((file) => [file.path, parsedByPath.get(file.path)]),
          ),
          ignoredFiles: ignoredFiles.map((file) => ({
            file,
            identity: parsedByPath.get(file.path) ?? null,
          })),
        },
      },
    };
  },
};

export function parseInsta360FileName(
  file: MediaFileDescriptor,
): Insta360FileIdentity | null {
  const match = INSTA360_RE.exec(displayName(file));
  if (!match) return null;
  const prefix = match[1].toUpperCase() as 'VID' | 'LRV';
  const date = match[2];
  const time = match[3];
  const streamIndex = match[4];
  const sequence = match[5];
  const extension = match[6].toLowerCase();
  return {
    prefix,
    date,
    time,
    streamIndex,
    sequence,
    extension,
    bundleKey: `${date}_${time}_${sequence}`,
  };
}

function chooseBundleKey(
  files: MediaFileDescriptor[],
  parsedByPath: Map<string, Insta360FileIdentity | null>,
): string | null {
  const candidate = files
    .map((file) => parsedByPath.get(file.path))
    .find((parsed) => parsed?.prefix === 'VID' && parsed.streamIndex === '00');
  if (candidate) return candidate.bundleKey;
  return (
    files.map((file) => parsedByPath.get(file.path)).find(Boolean)?.bundleKey ??
    null
  );
}

function choosePrimary(
  files: MediaFileDescriptor[],
  parsedByPath: Map<string, Insta360FileIdentity | null>,
): MediaFileDescriptor {
  return (
    files.find((file) => {
      const parsed = parsedByPath.get(file.path);
      return parsed?.prefix === 'VID' && parsed.streamIndex === '00';
    }) ??
    files.find((file) => {
      const parsed = parsedByPath.get(file.path);
      return parsed?.prefix === 'VID' && parsed.extension === 'insv';
    }) ??
    files.find((file) => fileExtension(file) === '.insv') ??
    files[0]
  );
}

function relationshipForInsta360SupportFile(
  file: MediaFileDescriptor,
  parsed: Insta360FileIdentity | null | undefined,
): string {
  if (parsed?.prefix === 'LRV' || fileExtension(file) === '.lrv')
    return 'proxy-video';
  if (parsed?.prefix === 'VID' && parsed.streamIndex !== '00')
    return 'paired-video-stream';
  return 'support-file';
}
