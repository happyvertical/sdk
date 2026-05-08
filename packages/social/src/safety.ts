import { randomUUID } from 'node:crypto';

import type {
  BaseSocialConfig,
  PostResult,
  PublishMode,
  SocialPlatformType,
} from './types.js';

export function resolvePublishMode(
  config: Pick<BaseSocialConfig, 'publishMode'>,
): PublishMode {
  return config.publishMode ?? 'public';
}

export function isPublicPublishMode(mode: PublishMode): boolean {
  return mode === 'public';
}

export function createSafetyResult(options: {
  platform: SocialPlatformType;
  mode: PublishMode;
  postType: 'text' | 'image' | 'video' | 'link';
  payload?: unknown;
  remoteId?: string;
  staged?: boolean;
  note?: string;
  metadata?: Record<string, unknown>;
}): PostResult {
  const status = options.mode === 'dry_run' ? 'dry_run' : 'staged';
  const id =
    options.remoteId ?? `${options.platform}-${status}-${randomUUID()}`;

  return {
    id,
    url: '',
    status,
    metadata: {
      publishMode: options.mode,
      safety: true,
      staged: options.staged ?? status === 'staged',
      postType: options.postType,
      remoteId: options.remoteId,
      payload: options.payload,
      note: options.note,
      ...options.metadata,
    },
  };
}
