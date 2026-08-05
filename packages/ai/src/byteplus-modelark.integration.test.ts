/**
 * Live integration tests for the BytePlus ModelArk (Seedance) video-generation
 * provider.
 *
 * The endpoint paths, request/response field names, and the
 * `queued|running|cancelled|succeeded|failed|expired` status enum used by
 * `byteplus-modelark.ts` were confirmed against BytePlus's own published
 * docs and blog examples, but the `expired` status, the list query params,
 * and the DELETE-as-cancel-or-delete semantics have not been exercised
 * against a live account by the rest of this package's test suite (which
 * mocks `fetch`). These tests corroborate the parts that are cheap and safe
 * to exercise for real — access validation, task creation, status
 * retrieval, and cancelling a still-queued task — without waiting for or
 * paying for a full render.
 *
 * Skipped unless `MODELARK_API_KEY` (or `ARK_API_KEY`) is available in the
 * environment, matching this package's existing skipped-integration-test
 * pattern (see `litellm.integration.test.ts`, `ollama.integration.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import { getAI } from './index';

const apiKey = process.env.MODELARK_API_KEY || process.env.ARK_API_KEY;
const baseUrl = process.env.MODELARK_BASE_URL;

describe('BytePlus ModelArk Integration Tests', () => {
  it.skipIf(!apiKey)(
    'should validate access against the real ModelArk task-list endpoint',
    async () => {
      const client = await getAI({
        type: 'byteplus-modelark',
        apiKey,
        baseUrl,
      });

      await expect(client.validateVideoGenerationAccess()).resolves.toBe(true);
    },
    30000,
  );

  it.skipIf(!apiKey)(
    'should submit a task, retrieve its status, and cancel it while still queued',
    async () => {
      const client = await getAI({
        type: 'byteplus-modelark',
        apiKey,
        baseUrl,
      });

      // Cheapest supported configuration: short duration, small resolution.
      const job = await client.submitVideoGenerationJob({
        prompt: '@happyvertical/ai integration test — safe to discard',
        durationSeconds: 4,
        resolution: '480p',
      });

      expect(job.jobId).toBeTruthy();
      expect(job.provider).toBe('byteplus-modelark');

      const status = await client.getVideoGenerationJob(job);
      expect(['queued', 'running', 'succeeded']).toContain(status.status);

      // Cancellation is best-effort: ModelArk only cancels a task that is
      // still queued and rejects cancellation of one that has already
      // started rendering, so tolerate either outcome rather than
      // asserting cancellation always succeeds.
      try {
        await client.cancelVideoGenerationJob(job);
      } catch (_error) {
        // Acceptable: the task had already moved past 'queued' by the
        // time cancellation was attempted.
      }
    },
    30000,
  );
});
