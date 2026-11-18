import { describe, expect, it } from 'vitest';
import { type ChangeFeedResult, isResyncRequired } from '../src/index';

describe('change feed contract', () => {
  it('distinguishes a resync result from a batch without exceptions', () => {
    const batch: ChangeFeedResult = {
      status: 'ok',
      cursor: 'c1',
      hasMore: false,
      initial: true,
      added: [],
      changed: [],
      removed: [],
    };
    const resync: ChangeFeedResult = {
      status: 'resync-required',
      reason: 'cursor-expired',
    };
    expect(isResyncRequired(batch)).toBe(false);
    expect(isResyncRequired(resync)).toBe(true);
  });
});
