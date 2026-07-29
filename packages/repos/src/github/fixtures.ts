import { createHmac } from 'node:crypto';
import type { GitHubWebhookHeaders } from './webhooks.js';

/** Exact webhook bytes and headers suitable for deterministic tests. */
export interface GitHubWebhookFixture {
  rawBody: Uint8Array;
  headers: GitHubWebhookHeaders;
}

/**
 * Produces exact, repeatable webhook bytes and headers for integration suites.
 * Pass the same delivery id for duplicates, or a new id with the same payload
 * for a provider redelivery.
 * @param options Secret, delivery identity, event name, and payload.
 * @returns Exact bytes and matching GitHub delivery headers.
 */
export function createGitHubWebhookFixture(options: {
  secret: string;
  deliveryId: string;
  event: string;
  payload: unknown;
}): GitHubWebhookFixture {
  const rawBody = new TextEncoder().encode(JSON.stringify(options.payload));
  const signature = createHmac('sha256', options.secret)
    .update(rawBody)
    .digest('hex');
  return {
    rawBody,
    headers: {
      'x-github-delivery': options.deliveryId,
      'x-github-event': options.event,
      'x-hub-signature-256': `sha256=${signature}`,
    },
  };
}
