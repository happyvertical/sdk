import { beforeEach, describe, expect, it } from 'vitest';
import {
  getFilesystem as getEntrypointFilesystem,
  getProviderInfo as getEntrypointProviderInfo,
  initializeProviders as initializeEntrypointProviders,
} from './factory';
import { GoogleDriveProvider } from './providers/gdrive';
import {
  getFilesystem as getSharedFilesystem,
  initializeProviders as initializeSharedProviders,
} from './shared/factory';

describe('factory entrypoints', () => {
  beforeEach(async () => {
    await Promise.all([
      initializeEntrypointProviders(),
      initializeSharedProviders(),
    ]);
  });

  it('accepts service account credentials in the legacy factory entrypoint', async () => {
    const filesystem = await getEntrypointFilesystem({
      type: 'gdrive',
      serviceAccountKey: '{}',
    });

    expect(filesystem).toBeInstanceOf(GoogleDriveProvider);
  });

  it('auto-detects Google Drive when only an access token is provided', async () => {
    const filesystem = await getEntrypointFilesystem({
      accessToken: 'test-token',
    });

    expect(filesystem).toBeInstanceOf(GoogleDriveProvider);
  });

  it('keeps the shared factory aligned for access-token auto-detection', async () => {
    const filesystem = await getSharedFilesystem({
      accessToken: 'test-token',
    });

    expect(filesystem).toBeInstanceOf(GoogleDriveProvider);
  });

  it('does not advertise OAuth-only required options for Google Drive', () => {
    expect(getEntrypointProviderInfo('gdrive').requiredOptions).toEqual([]);
  });
});
