import type {
  MediaBundleHandler,
  MediaBundleInspection,
  MediaBundleSupportFile,
  NormalizedMediaMetadata,
} from '../types.js';
import {
  displayName,
  isVideoFile,
  mergeMetadata,
  probeEmbeddedMetadata,
  probeVideoMetadata,
} from '../utils.js';

export const genericVideoBundleHandler: MediaBundleHandler = {
  id: 'generic-video',
  version: '1.0.0',
  priority: 10,
  capabilities: ['stream-info'],

  supports(files) {
    return files.some(isVideoFile);
  },

  async inspect(files, context): Promise<MediaBundleInspection> {
    const primary = files.find(isVideoFile) ?? files[0];
    const warnings: string[] = [];
    const supportFiles: MediaBundleSupportFile[] = files
      .filter((file) => file !== primary)
      .map((file) => ({
        file: { ...file, role: file.role ?? 'support' },
        role: 'support',
        relationship: 'co-located-file',
        visibility: context.defaultSupportFileVisibility ?? 'hidden-retained',
      }));

    let metadata: NormalizedMediaMetadata = {
      mimeType: primary.mimeType,
    };

    if (context.probe === false) {
      warnings.push(
        'probe disabled; returning file-level generic video inspection',
      );
    } else {
      try {
        metadata = mergeMetadata(
          await probeVideoMetadata(primary, context.tools?.ffprobePath),
          metadata,
        );
      } catch (error) {
        warnings.push(
          `ffprobe failed for ${displayName(primary)}: ${formatError(error)}`,
        );
      }

      try {
        metadata = mergeMetadata(
          await probeEmbeddedMetadata(primary, context.tools?.exiftoolPath),
          metadata,
        );
      } catch (error) {
        warnings.push(
          `exiftool failed for ${displayName(primary)}: ${formatError(error)}`,
        );
      }
    }

    const capabilities = new Set(genericVideoBundleHandler.capabilities);
    if (metadata.gpsTrack && metadata.gpsTrack.length > 0)
      capabilities.add('gps-track');

    return {
      handlerId: genericVideoBundleHandler.id,
      handlerVersion: genericVideoBundleHandler.version,
      formatFamily: 'generic-video',
      primary: { ...primary, role: 'primary' },
      supportFiles,
      metadata,
      capabilities: [...capabilities],
      warnings,
      errors: [],
    };
  },
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
