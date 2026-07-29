import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ForgeError } from '../forge/errors.js';
import { createGitHubWebhookFixture } from './fixtures.js';
import { GitHubWebhookVerifier } from './webhooks.js';

function expectForgeCode(callback: () => unknown, code: string): void {
  let failure: unknown;
  try {
    callback();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ForgeError);
  expect(failure).toMatchObject({ code });
}

describe('GitHubWebhookVerifier', () => {
  it('verifies exact raw bytes with rotated secrets before parsing', () => {
    const rawBody = new TextEncoder().encode(
      '{ "action": "opened", "pull_request": {"number": 7, "state": "open", "head": {"sha": "abc"}, "base": {"sha": "def"}} }',
    );
    const signature = createHmac('sha256', 'old-secret')
      .update(rawBody)
      .digest('hex');
    const verifier = new GitHubWebhookVerifier({
      secrets: ['new-secret', 'old-secret'],
      now: () => new Date('2026-07-27T01:00:00.000Z'),
    });

    const event = verifier.verifyAndNormalize(rawBody, {
      'X-Hub-Signature-256': `sha256=${signature}`,
      'X-GitHub-Delivery': 'delivery-1',
      'X-GitHub-Event': 'pull_request',
    });

    expect(event).toMatchObject({
      deliveryId: 'delivery-1',
      action: 'opened',
      receivedAt: new Date('2026-07-27T01:00:00.000Z'),
      observation: {
        kind: 'pull_request',
        pullRequest: { number: 7, headSha: 'abc' },
      },
    });

    const reparsed = new TextEncoder().encode(
      JSON.stringify(JSON.parse(new TextDecoder().decode(rawBody))),
    );
    expectForgeCode(
      () => verifier.verify(reparsed, `sha256=${signature}`),
      'SIGNATURE_INVALID',
    );
  });

  it('rejects a malformed body as signature-invalid before JSON-invalid', () => {
    const verifier = new GitHubWebhookVerifier({ secrets: 'secret' });
    const malformed = new TextEncoder().encode('{');

    expectForgeCode(
      () =>
        verifier.verifyAndNormalize(malformed, {
          'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
          'x-github-delivery': 'delivery',
          'x-github-event': 'push',
        }),
      'SIGNATURE_INVALID',
    );

    const validSignature = createHmac('sha256', 'secret')
      .update(malformed)
      .digest('hex');
    expectForgeCode(
      () =>
        verifier.verifyAndNormalize(malformed, {
          'x-hub-signature-256': `sha256=${validSignature}`,
          'x-github-delivery': 'delivery',
          'x-github-event': 'push',
        }),
      'INVALID_INPUT',
    );
  });

  it('provides deterministic duplicate, redelivery, delayed, and out-of-order fixtures', () => {
    const verifier = new GitHubWebhookVerifier({
      secrets: 'secret',
      now: () => new Date('2026-07-27T02:00:00.000Z'),
    });
    const laterProviderEvent = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'delivery-later',
      event: 'pull_request_review',
      payload: {
        action: 'submitted',
        pull_request: {
          number: 4,
          state: 'open',
          head: { sha: 'head' },
          base: { sha: 'base' },
        },
        review: {
          id: 2,
          state: 'approved',
          submitted_at: '2026-07-27T01:30:00.000Z',
        },
      },
    });
    const earlierProviderEvent = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'delivery-earlier',
      event: 'pull_request_review',
      payload: {
        action: 'submitted',
        pull_request: {
          number: 4,
          state: 'open',
          head: { sha: 'head' },
          base: { sha: 'base' },
        },
        review: {
          id: 1,
          state: 'commented',
          submitted_at: '2026-07-27T01:00:00.000Z',
        },
      },
    });

    const first = verifier.verifyAndNormalize(
      laterProviderEvent.rawBody,
      laterProviderEvent.headers,
    );
    const duplicate = verifier.verifyAndNormalize(
      laterProviderEvent.rawBody,
      laterProviderEvent.headers,
    );
    const redeliveryFixture = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'delivery-redelivery',
      event: 'pull_request_review',
      payload: first.raw,
    });
    const redelivery = verifier.verifyAndNormalize(
      redeliveryFixture.rawBody,
      redeliveryFixture.headers,
    );
    const delayedOutOfOrder = verifier.verifyAndNormalize(
      earlierProviderEvent.rawBody,
      earlierProviderEvent.headers,
    );

    expect(duplicate).toEqual(first);
    expect(redelivery.raw).toEqual(first.raw);
    expect(redelivery.deliveryId).not.toBe(first.deliveryId);
    expect(delayedOutOfOrder.receivedAt).toEqual(first.receivedAt);
    expect(delayedOutOfOrder.occurredAt?.getTime()).toBeLessThan(
      first.occurredAt?.getTime() ?? 0,
    );
  });

  it.each([
    ['push', { ref: 'refs/heads/main', after: 'abc' }, 'push'],
    ['status', { sha: 'abc', state: 'success' }, 'status'],
    [
      'check_run',
      { check_run: { id: 1, name: 'ci', head_sha: 'abc' } },
      'check',
    ],
    [
      'merge_group',
      { merge_group: { head_sha: 'merge', base_sha: 'base' } },
      'merge_group',
    ],
    ['deployment', { deployment: { id: 5, sha: 'abc' } }, 'deployment'],
    [
      'installation',
      { installation: { id: 7, account: { login: 'org' } } },
      'installation',
    ],
    [
      'repository',
      {
        repository: {
          id: 8,
          name: 'repo',
          full_name: 'org/repo',
          owner: { login: 'org' },
        },
      },
      'repository',
    ],
    [
      'pull_request',
      {
        action: 'closed',
        pull_request: {
          number: 9,
          state: 'closed',
          merged: true,
          merge_commit_sha: 'merge',
          head: { sha: 'head' },
          base: { sha: 'base' },
        },
      },
      'merge',
    ],
    ['ping', { zen: 'Keep it logically awesome.' }, 'availability'],
  ])('normalizes %s as a %s observation', (event, payload, kind) => {
    const verifier = new GitHubWebhookVerifier({ secrets: 'secret' });
    const fixture = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: `delivery-${event}`,
      event,
      payload,
    });
    expect(
      verifier.verifyAndNormalize(fixture.rawBody, fixture.headers).observation
        .kind,
    ).toBe(kind);
  });

  it('only emits merge observations for closed merged pull requests', () => {
    const verifier = new GitHubWebhookVerifier({ secrets: 'secret' });
    const pullRequest = {
      number: 9,
      state: 'closed',
      merged: true,
      merge_commit_sha: 'merge',
      head: { sha: 'head' },
      base: { sha: 'base' },
    };
    const labeled = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'post-merge-label',
      event: 'pull_request',
      payload: { action: 'labeled', pull_request: pullRequest },
    });
    const closed = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'merge-close',
      event: 'pull_request',
      payload: { action: 'closed', pull_request: pullRequest },
    });

    expect(
      verifier.verifyAndNormalize(labeled.rawBody, labeled.headers).observation
        .kind,
    ).toBe('pull_request');
    expect(
      verifier.verifyAndNormalize(closed.rawBody, closed.headers).observation
        .kind,
    ).toBe('merge');
  });

  it('uses the top-level status timestamp for ordered observations', () => {
    const verifier = new GitHubWebhookVerifier({ secrets: 'secret' });
    const fixture = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'status-timestamp',
      event: 'status',
      payload: {
        sha: 'abc',
        state: 'success',
        created_at: '2026-07-27T01:23:45.000Z',
      },
    });

    expect(
      verifier.verifyAndNormalize(fixture.rawBody, fixture.headers).occurredAt,
    ).toEqual(new Date('2026-07-27T01:23:45.000Z'));
  });

  it('normalizes check suites and deployment status fields without losing raw payloads', () => {
    const verifier = new GitHubWebhookVerifier({ secrets: 'secret' });
    const suite = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'suite',
      event: 'check_suite',
      payload: {
        check_suite: {
          id: 9,
          app: { name: 'Required CI' },
          head_sha: 'merge-head',
          status: 'completed',
          conclusion: 'success',
        },
      },
    });
    const deployment = createGitHubWebhookFixture({
      secret: 'secret',
      deliveryId: 'deployment-status',
      event: 'deployment_status',
      payload: {
        deployment: { id: 4, sha: 'head', ref: 'main' },
        deployment_status: {
          state: 'success',
          environment: 'production',
          environment_url: 'https://example.test',
        },
      },
    });

    expect(
      verifier.verifyAndNormalize(suite.rawBody, suite.headers),
    ).toMatchObject({
      observation: {
        kind: 'check',
        check: {
          id: '9',
          name: 'Required CI',
          headSha: 'merge-head',
          status: 'completed',
          conclusion: 'success',
        },
      },
    });
    expect(
      verifier.verifyAndNormalize(deployment.rawBody, deployment.headers),
    ).toMatchObject({
      observation: {
        kind: 'deployment',
        deployment: {
          id: '4',
          sha: 'head',
          environment: 'production',
          state: 'success',
          url: 'https://example.test',
        },
      },
    });
  });
});
