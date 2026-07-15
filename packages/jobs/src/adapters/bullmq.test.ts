import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { BullMQJobStore } from './bullmq.js';

interface BullMQPackageManifest {
  version: string;
}

const require = createRequire(import.meta.url);

describe('BullMQJobStore compatibility', () => {
  it('loads BullMQ 5.80.4 without opening a Redis connection', async () => {
    const manifest = require('bullmq/package.json') as BullMQPackageManifest;
    const store = new BullMQJobStore();

    expect(manifest.version).toBe('5.80.4');
    await expect(store.initialize()).resolves.toBeUndefined();
    await expect(store.close()).resolves.toBeUndefined();
  });
});
