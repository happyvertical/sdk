import { FileSizeLimitExceededError, FilesystemError } from './types';

export function validateMaxBytes(
  maxBytes: number | undefined,
  path: string,
  provider: string,
): void {
  if (
    maxBytes !== undefined &&
    (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
  ) {
    throw new FilesystemError(
      `maxBytes must be a non-negative safe integer: ${path}`,
      'EINVAL',
      path,
      provider,
    );
  }
}

export function enforceMaxBytes(
  observedBytes: number,
  maxBytes: number | undefined,
  path: string,
  provider: string,
): void {
  if (maxBytes !== undefined && observedBytes > maxBytes) {
    throw new FileSizeLimitExceededError(
      path,
      maxBytes,
      observedBytes,
      provider,
    );
  }
}
