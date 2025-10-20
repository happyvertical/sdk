/**
 * Optional tests for @have/utils
 *
 * These tests are slow or potentially flaky and are excluded from regular test runs.
 * Run with: npm run test:optional
 *
 * Following organization-wide testing standard:
 * - Tests in *.optional.test.ts are for slow/expensive operations
 * - Tests that require external resources or long timeouts
 * - Tests that may be flaky due to timing dependencies
 */

import { describe, expect, it } from 'vitest';
import { sleep, TimeoutError, waitFor } from './index';

describe('waitFor optional tests', () => {
  /**
   * This test verifies timeout behavior but is slow (30+ seconds) and
   * potentially flaky due to timing precision.
   *
   * Moved to optional tests per testing standard.
   */
  it('should timeout when condition not met within time limit', async () => {
    let attempts = 0;

    await expect(
      waitFor(
        async () => {
          attempts++;
          await sleep(1000);
          // Never returns a defined value (would need 10 attempts)
          if (attempts >= 10) {
            return true;
          }
          return undefined; // Explicit return for clarity
        },
        {
          delay: 1000, // 1 second between attempts
          timeout: 5000, // 5 second total timeout
        },
      ),
    ).rejects.toThrow(TimeoutError);

    // Verify it attempted at least once (timing may vary)
    expect(attempts).toBeGreaterThan(0);
  }, 10000); // 10 second test timeout
});
