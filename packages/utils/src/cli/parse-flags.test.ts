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

  it('ignores the POSIX end-of-options marker', () => {
    expect(parseFlagArgs(['--', '--from', 'backup-a'])).toEqual({
      flags: { from: 'backup-a' },
      positionals: [],
    });
  });

  it('treats a flag followed by another flag as boolean true', () => {
    expect(parseFlagArgs(['--prod', '--skip-files'])).toEqual({
      flags: { prod: true, skipFiles: true },
      positionals: [],
    });
  });
});
