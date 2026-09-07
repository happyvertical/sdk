import { describe, expect, it } from 'vitest';
import { DatabaseError, ErrorCode } from './types';

describe('DatabaseError', () => {
  it('keeps a supplied cause snapshot and serializes useful driver fields', () => {
    const cause = Object.assign(new Error('relation does not exist'), {
      code: '42P01',
      detail: 'missing relation',
      severity: 'ERROR',
    });
    const error = new DatabaseError(
      'Failed to execute raw query',
      { operation: 'query' },
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    expect(error.cause).toBe(cause);
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(
      false,
    );
    expect(Object.keys(error)).not.toContain('cause');
    expect(error.toJSON()).toMatchObject({
      name: 'DatabaseError',
      message: 'Failed to execute raw query',
      cause: {
        name: 'Error',
        message: 'relation does not exist',
        code: '42P01',
        detail: 'missing relation',
        severity: 'ERROR',
      },
    });
  });

  it('omits cause from JSON when none was supplied', () => {
    const error = new DatabaseError('Validation failed');

    expect(error.cause).toBeUndefined();
    expect(error.toJSON()).not.toHaveProperty('cause');
  });
});
