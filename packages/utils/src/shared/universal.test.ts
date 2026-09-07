import { describe, expect, it } from 'vitest';
import { getTempDirectory } from './universal';

describe('getTempDirectory', () => {
  it('uses the fallback path when process is unavailable in a browser', () => {
    const processDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'process',
    );
    Reflect.deleteProperty(globalThis, 'process');

    try {
      expect(getTempDirectory('cache')).toBe('/tmp/.have-sdk/cache');
    } finally {
      if (processDescriptor) {
        Object.defineProperty(globalThis, 'process', processDescriptor);
      }
    }
  });
});
