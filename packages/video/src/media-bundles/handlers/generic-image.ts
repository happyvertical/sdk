import { getImageMetadata } from '@happyvertical/images';

import type {
  MediaBundleHandler,
  MediaBundleInspection,
  NormalizedMediaMetadata,
} from '../types.js';
import { displayName, formatError, isImageFile } from '../utils.js';

export const genericImageBundleHandler: MediaBundleHandler = {
  id: 'generic-image',
  version: '1.0.0',
  priority: 10,
  capabilities: ['image-metadata'],

  supports(files) {
    return files.some(isImageFile);
  },

  async inspect(files, context): Promise<MediaBundleInspection> {
    const primary = files.find(isImageFile) ?? files[0];
    const warnings: string[] = [];
    let metadata: NormalizedMediaMetadata = {
      mimeType: primary.mimeType,
    };

    if (context.probe === false) {
      warnings.push(
        'probe disabled; returning file-level generic image inspection',
      );
    } else {
      try {
        const image = await getImageMetadata(primary.path);
        metadata = {
          width: image.width,
          height: image.height,
          mimeType: primary.mimeType,
          raw: { image },
        };
      } catch (error) {
        warnings.push(
          `image metadata probe failed for ${displayName(primary)}: ${formatError(error)}`,
        );
      }
    }

    return {
      handlerId: genericImageBundleHandler.id,
      handlerVersion: genericImageBundleHandler.version,
      formatFamily: 'generic-image',
      primary: { ...primary, role: 'primary' },
      supportFiles: files
        .filter((file) => file !== primary)
        .map((file) => ({
          file: { ...file, role: file.role ?? 'support' },
          role: 'support' as const,
          relationship: 'co-located-file',
          visibility: context.defaultSupportFileVisibility ?? 'hidden-retained',
        })),
      metadata,
      capabilities: [...(genericImageBundleHandler.capabilities ?? [])],
      warnings,
      errors: [],
    };
  },
};
