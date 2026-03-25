import { beforeEach, describe, expect, it } from 'vitest';
import { getFilesystem, getProviderInfo, isProviderAvailable } from '../index';
import { initializeProviders } from '../shared/factory';
import { S3FilesystemProvider } from './s3';

describe('S3 filesystem provider', () => {
  beforeEach(async () => {
    await initializeProviders();
  });

  it('registers the S3 provider', () => {
    expect(isProviderAvailable('s3')).toBe(true);
    expect(getProviderInfo('s3').available).toBe(true);
  });

  it('creates an S3 filesystem instance without issuing network requests', async () => {
    const filesystem = await getFilesystem({
      type: 's3',
      region: 'us-east-1',
      bucket: 'imago',
      endpoint: 'http://127.0.0.1:39000',
      accessKeyId: 'imago',
      secretAccessKey: 'imago-dev-secret',
      forcePathStyle: true,
    });

    expect(filesystem).toBeInstanceOf(S3FilesystemProvider);
  });
});
