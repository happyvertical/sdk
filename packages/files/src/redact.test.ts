import { describe, expect, it } from 'vitest';
import { redactFilesystemConfig } from './redact.js';

describe('redactFilesystemConfig', () => {
  it('redacts common credential keys, leaves non-secret keys intact', () => {
    expect(
      redactFilesystemConfig({
        accessKeyId: 'key',
        basePath: 'employment-search/profile-assets',
        clientSecret: 'client-secret',
        credentials: {
          client_email: 'service@example.com',
          private_key: 'private-key',
        },
        secretAccessKey: 'secret',
        type: 's3',
      }),
    ).toEqual({
      accessKeyId: '[redacted]',
      basePath: 'employment-search/profile-assets',
      clientSecret: '[redacted]',
      credentials: '[redacted]',
      secretAccessKey: '[redacted]',
      type: 's3',
    });
  });

  it('handles arrays and nested objects without secret keys', () => {
    expect(
      redactFilesystemConfig({ list: [{ name: 'a' }, { name: 'b' }] }),
    ).toEqual({
      list: [{ name: 'a' }, { name: 'b' }],
    });
  });

  it('returns scalars unchanged', () => {
    expect(redactFilesystemConfig('hello')).toBe('hello');
    expect(redactFilesystemConfig(42)).toBe(42);
    expect(redactFilesystemConfig(null)).toBeNull();
    expect(redactFilesystemConfig(undefined)).toBeUndefined();
  });

  it('redacts case-insensitive variants', () => {
    expect(
      redactFilesystemConfig({
        APIKey: 'a',
        Token: 'b',
        Password: 'c',
        ServiceAccountKey: 'd',
      }),
    ).toEqual({
      APIKey: '[redacted]',
      Token: '[redacted]',
      Password: '[redacted]',
      ServiceAccountKey: '[redacted]',
    });
  });

  it('handles circular references without stack overflow', () => {
    // Connection pools and EventEmitter-backed config holders sometimes
    // carry circular references. Recursing without a visited guard
    // crashes with RangeError; the WeakSet guard returns a sentinel
    // instead so secrets at higher levels are still redacted.
    const config: Record<string, unknown> = {
      name: 'cycle',
      password: 'should-be-redacted',
    };
    config.self = config;
    const result = redactFilesystemConfig(config) as Record<string, unknown>;
    expect(result.name).toBe('cycle');
    expect(result.password).toBe('[redacted]');
    expect(result.self).toBe('[circular]');
  });

  it('handles circular references in arrays', () => {
    const arr: unknown[] = [{ token: 'oops' }];
    arr.push(arr);
    const result = redactFilesystemConfig(arr) as unknown[];
    expect((result[0] as Record<string, unknown>).token).toBe('[redacted]');
    expect(result[1]).toBe('[circular]');
  });
});
