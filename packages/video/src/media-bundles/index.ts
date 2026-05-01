import { genericImageBundleHandler } from './handlers/generic-image.js';
import { genericVideoBundleHandler } from './handlers/generic-video.js';
import { insta360BundleHandler } from './handlers/insta360.js';
import type {
  InspectMediaBundleOptions,
  MediaBundleHandler,
  MediaBundleInspection,
  MediaFileDescriptor,
} from './types.js';

export { genericImageBundleHandler } from './handlers/generic-image.js';
export { genericVideoBundleHandler } from './handlers/generic-video.js';
export {
  type Insta360FileIdentity,
  insta360BundleHandler,
  parseInsta360FileName,
} from './handlers/insta360.js';
export * from './types.js';

export const defaultMediaBundleHandlers: MediaBundleHandler[] = [
  insta360BundleHandler,
  genericVideoBundleHandler,
  genericImageBundleHandler,
];

export async function inspectMediaBundle(
  files: MediaFileDescriptor[],
  options: InspectMediaBundleOptions = {},
): Promise<MediaBundleInspection> {
  if (files.length === 0) {
    throw new Error('inspectMediaBundle requires at least one file');
  }

  const context = {
    ...options,
    defaultSupportFileVisibility:
      options.defaultSupportFileVisibility ?? 'hidden-retained',
  };
  const handlers = options.handlers ?? defaultMediaBundleHandlers;
  const orderedHandlers = handlers
    .map((handler, index) => ({ handler, index }))
    .sort(
      (left, right) =>
        right.handler.priority - left.handler.priority ||
        left.index - right.index,
    );

  for (const { handler } of orderedHandlers) {
    if (!(await handler.supports(files, context))) continue;
    const inspection = await handler.inspect(files, context);
    const validationWarnings = handler.validate
      ? await handler.validate(inspection, context)
      : [];
    if (validationWarnings.length > 0) {
      inspection.warnings.push(...validationWarnings);
    }
    return inspection;
  }

  return {
    handlerId: 'unknown',
    handlerVersion: '1.0.0',
    formatFamily: 'unknown',
    primary: { ...files[0], role: 'primary' },
    supportFiles: files.slice(1).map((file) => ({
      file: { ...file, role: file.role ?? 'support' },
      role: 'support',
      relationship: 'co-located-file',
      visibility: context.defaultSupportFileVisibility,
    })),
    metadata: {
      mimeType: files[0].mimeType,
    },
    capabilities: [],
    warnings: ['no media bundle handler matched; returned unknown inspection'],
    errors: [],
  };
}
