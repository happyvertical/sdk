import { describe, expect, it } from 'vitest';
import { parseFlagArgs } from './parse-flags.js';

describe('parseFlagArgs', () => {
  it('splits flags and positionals', () => {
    expect(parseFlagArgs(['--from', 'backup-a', 'extra'])).toEqual({
      flags: { from: 'backup-a' },
      positionals: ['extra'],
    });
  });

  it('treats a flag with no value as boolean true', () => {
    expect(parseFlagArgs(['--skip-files'])).toEqual({
      flags: { skipFiles: true },
      positionals: [],
    });
  });

  it('parses inline --key=value form', () => {
    expect(parseFlagArgs(['--label=prod=db'])).toEqual({
      flags: { label: 'prod=db' },
      positionals: [],
    });
  });

  it('camel-cases kebab keys', () => {
    expect(parseFlagArgs(['--allow-production'])).toEqual({
      flags: { allowProduction: true },
      positionals: [],
    });
  });

  it('treats all args after POSIX end-of-options marker as positionals', () => {
    expect(parseFlagArgs(['--', '--from', 'backup-a'])).toEqual({
      flags: {},
      positionals: ['--from', 'backup-a'],
    });
  });

  it('treats a flag followed by another flag as boolean true', () => {
    expect(parseFlagArgs(['--prod', '--skip-files'])).toEqual({
      flags: { prod: true, skipFiles: true },
      positionals: [],
    });
  });

  it('rejects an empty flag name (--=value, --=) instead of silently producing an empty key', () => {
    expect(() => parseFlagArgs(['--=value'])).toThrow(/empty/);
    expect(() => parseFlagArgs(['--='])).toThrow(/empty/);
  });
});
