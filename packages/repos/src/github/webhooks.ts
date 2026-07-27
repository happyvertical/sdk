import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForgeError, ForgeSignatureError } from '../forge/errors.js';
import type {
  CheckRun,
  ForgeActor,
  ForgeEventEnvelope,
  ForgeInstallationRef,
  ForgeObservation,
  ForgePullRequestRef,
  ForgeRepositoryRef,
} from '../forge/types.js';

export type GitHubWebhookHeaders =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>;

/** Construction options for raw GitHub webhook verification. */
export interface GitHubWebhookVerifierOptions {
  /** Current secret first, followed by still-valid rotation secrets. */
  secrets: string | readonly string[];
  now?: () => Date;
}

function headerValue(
  headers: GitHubWebhookHeaders,
  requestedName: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(requestedName) ?? undefined;
  }
  const requested = requestedName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== requested) continue;
    return typeof value === 'string' ? value : value?.[0];
  }
  return undefined;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function actor(value: unknown): ForgeActor | undefined {
  const data = object(value);
  const login = optionalString(data.login);
  if (!login) return undefined;
  return {
    id: data.id === undefined ? undefined : String(data.id),
    login,
    type: optionalString(data.type),
  };
}

function repository(value: unknown): ForgeRepositoryRef | undefined {
  const data = object(value);
  const ownerData = object(data.owner);
  const fullName = optionalString(data.full_name);
  const name = optionalString(data.name);
  const owner = optionalString(ownerData.login);
  if (!name || (!owner && !fullName)) return undefined;
  const resolvedOwner = owner ?? fullName?.split('/')[0] ?? '';
  return {
    id: data.node_id === undefined ? undefined : String(data.node_id),
    owner: resolvedOwner,
    name,
    fullName: fullName ?? `${resolvedOwner}/${name}`,
    defaultBranch: optionalString(data.default_branch),
    private: typeof data.private === 'boolean' ? data.private : undefined,
    url: optionalString(data.html_url),
  };
}

function installation(value: unknown): ForgeInstallationRef | undefined {
  const data = object(value);
  if (data.id === undefined) return undefined;
  const accountData = object(data.account);
  return {
    id: String(data.id),
    account: optionalString(accountData.login),
    repositorySelection:
      data.repository_selection === 'all' ||
      data.repository_selection === 'selected'
        ? data.repository_selection
        : undefined,
  };
}

function pullRequest(value: unknown): ForgePullRequestRef {
  const data = object(value);
  const head = object(data.head);
  const base = object(data.base);
  return {
    id: data.node_id === undefined ? undefined : String(data.node_id),
    number: Number(data.number),
    state: data.state === 'closed' ? 'closed' : 'open',
    draft: typeof data.draft === 'boolean' ? data.draft : undefined,
    headSha: String(head.sha ?? ''),
    headRef: optionalString(head.ref),
    baseSha: optionalString(base.sha),
    baseRef: optionalString(base.ref),
    merged: typeof data.merged === 'boolean' ? data.merged : undefined,
    mergeCommitSha: optionalString(data.merge_commit_sha),
    url: optionalString(data.html_url),
  };
}

function check(value: unknown): CheckRun {
  const data = object(value);
  const app = object(data.app);
  return {
    id: String(data.id ?? data.node_id ?? ''),
    name: String(data.name ?? app.name ?? 'check_suite'),
    headSha: String(data.head_sha ?? ''),
    status: (data.status ?? 'queued') as CheckRun['status'],
    conclusion:
      typeof data.conclusion === 'string'
        ? (data.conclusion as CheckRun['conclusion'])
        : undefined,
    detailsUrl: optionalString(data.details_url),
    externalId: optionalString(data.external_id),
    startedAt: optionalString(data.started_at)
      ? new Date(String(data.started_at))
      : undefined,
    completedAt: optionalString(data.completed_at)
      ? new Date(String(data.completed_at))
      : undefined,
    raw: data,
  };
}

function occurrence(payload: Record<string, unknown>): Date | undefined {
  const candidates = [
    object(payload.review).submitted_at,
    object(payload.check_run).completed_at,
    object(payload.check_run).started_at,
    object(payload.status).created_at,
    object(payload.deployment_status).created_at,
    object(payload.deployment).created_at,
    object(payload.pull_request).updated_at,
    object(payload.head_commit).timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const timestamp = new Date(candidate);
    if (!Number.isNaN(timestamp.getTime())) return timestamp;
  }
  return undefined;
}

function normalizeObservation(
  event: string,
  payload: Record<string, unknown>,
): ForgeObservation {
  if (event === 'ping') {
    return {
      kind: 'availability',
      available: true,
      message: optionalString(payload.zen),
    };
  }
  if (event === 'installation' || event === 'installation_repositories') {
    const installationRef = installation(payload.installation);
    if (!installationRef) return { kind: 'unknown' };
    const repositories = [
      ...(Array.isArray(payload.repositories) ? payload.repositories : []),
      ...(Array.isArray(payload.repositories_added)
        ? payload.repositories_added
        : []),
      ...(Array.isArray(payload.repositories_removed)
        ? payload.repositories_removed
        : []),
    ]
      .map(repository)
      .filter((item): item is ForgeRepositoryRef => item !== undefined);
    return {
      kind: 'installation',
      installation: installationRef,
      repositories,
    };
  }
  if (event === 'repository') {
    const repositoryRef = repository(payload.repository);
    return repositoryRef
      ? { kind: 'repository', repository: repositoryRef }
      : { kind: 'unknown' };
  }
  if (event === 'pull_request') {
    const pullRequestRef = pullRequest(payload.pull_request);
    return pullRequestRef.merged
      ? {
          kind: 'merge',
          pullRequest: pullRequestRef,
          mergeCommitSha: pullRequestRef.mergeCommitSha,
        }
      : { kind: 'pull_request', pullRequest: pullRequestRef };
  }
  if (event === 'pull_request_review') {
    const review = object(payload.review);
    return {
      kind: 'review',
      pullRequest: pullRequest(payload.pull_request),
      review: {
        id: String(review.id ?? review.node_id ?? ''),
        state: String(review.state ?? ''),
        body: optionalString(review.body),
        commitSha: optionalString(review.commit_id),
        submittedAt: optionalString(review.submitted_at)
          ? new Date(String(review.submitted_at))
          : undefined,
        author: actor(review.user),
      },
    };
  }
  if (event === 'push') {
    return {
      kind: 'push',
      ref: String(payload.ref ?? ''),
      beforeSha: optionalString(payload.before),
      afterSha: String(payload.after ?? ''),
      forced: typeof payload.forced === 'boolean' ? payload.forced : undefined,
      created:
        typeof payload.created === 'boolean' ? payload.created : undefined,
      deleted:
        typeof payload.deleted === 'boolean' ? payload.deleted : undefined,
    };
  }
  if (event === 'status') {
    return {
      kind: 'status',
      status: {
        id: String(payload.id ?? ''),
        sha: String(payload.sha ?? ''),
        state: String(payload.state ?? ''),
        context: String(payload.context ?? ''),
        description: optionalString(payload.description),
        targetUrl: optionalString(payload.target_url),
        createdAt: optionalString(payload.created_at)
          ? new Date(String(payload.created_at))
          : undefined,
        raw: payload,
      },
    };
  }
  if (event === 'check_run' || event === 'check_suite') {
    return {
      kind: 'check',
      check: check(payload.check_run ?? payload.check_suite),
    };
  }
  if (event === 'merge_group') {
    const mergeGroup = object(payload.merge_group);
    return {
      kind: 'merge_group',
      headSha: String(mergeGroup.head_sha ?? ''),
      headRef: optionalString(mergeGroup.head_ref),
      baseSha: optionalString(mergeGroup.base_sha),
      baseRef: optionalString(mergeGroup.base_ref),
    };
  }
  if (event === 'deployment' || event === 'deployment_status') {
    const deployment = object(payload.deployment);
    const deploymentStatus = object(payload.deployment_status);
    return {
      kind: 'deployment',
      deployment: {
        id: String(deployment.id ?? ''),
        sha: optionalString(deployment.sha),
        ref: optionalString(deployment.ref),
        environment:
          optionalString(deploymentStatus.environment) ??
          optionalString(deployment.environment),
        state: optionalString(deploymentStatus.state),
        url:
          optionalString(deploymentStatus.environment_url) ??
          optionalString(deploymentStatus.target_url),
      },
    };
  }
  return { kind: 'unknown' };
}

/**
 * Normalizes one already-verified GitHub payload.
 * @param deliveryId Stable provider delivery identity.
 * @param event GitHub event header value.
 * @param raw Parsed provider payload.
 * @param receivedAt Local receipt timestamp.
 * @returns A provider-neutral event envelope preserving the parsed payload.
 */
export function normalizeGitHubWebhook(
  deliveryId: string,
  event: string,
  raw: unknown,
  receivedAt = new Date(),
): ForgeEventEnvelope {
  const payload = object(raw);
  return {
    provider: 'github',
    deliveryId,
    event,
    action: optionalString(payload.action),
    occurredAt: occurrence(payload),
    receivedAt,
    installation: installation(payload.installation),
    repository: repository(payload.repository),
    actor: actor(payload.sender),
    observation: normalizeObservation(event, payload),
    raw,
  };
}

export class GitHubWebhookVerifier {
  private readonly secrets: readonly string[];
  private readonly now: () => Date;

  /**
   * Creates a verifier with a current secret and optional rotation secrets.
   * @param options Current/rotation secrets and optional clock.
   * @throws {ForgeError} When no non-empty secret is configured.
   */
  constructor(options: GitHubWebhookVerifierOptions) {
    this.secrets =
      typeof options.secrets === 'string'
        ? [options.secrets]
        : [...options.secrets];
    if (this.secrets.length === 0 || this.secrets.some((secret) => !secret)) {
      throw new ForgeError(
        'At least one non-empty GitHub webhook secret is required',
        'CONFIGURATION_ERROR',
        { provider: 'github' },
      );
    }
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Verifies unchanged provider bytes with constant-time comparisons.
   * @param rawBody Exact bytes received from the HTTP server.
   * @param signature GitHub SHA-256 signature header.
   * @returns Index of the configured secret that matched.
   * @throws {ForgeSignatureError} When the signature is missing or invalid.
   */
  verify(rawBody: Uint8Array, signature: string | undefined): number {
    if (!signature?.startsWith('sha256=')) throw new ForgeSignatureError();
    const suppliedHex = signature.slice('sha256='.length);
    if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) {
      throw new ForgeSignatureError();
    }
    const supplied = Buffer.from(suppliedHex, 'hex');
    let matchedIndex = -1;
    this.secrets.forEach((secret, index) => {
      const expected = createHmac('sha256', secret).update(rawBody).digest();
      if (timingSafeEqual(expected, supplied)) matchedIndex = index;
    });
    if (matchedIndex === -1) throw new ForgeSignatureError();
    return matchedIndex;
  }

  /**
   * Verifies raw bytes before decoding and normalizes the delivery.
   * @param rawBody Exact bytes received from the HTTP server.
   * @param headers Case-insensitive GitHub delivery headers.
   * @returns Verified normalized delivery.
   * @throws {ForgeError} For invalid signatures, headers, UTF-8, or JSON.
   */
  verifyAndNormalize(
    rawBody: Uint8Array,
    headers: GitHubWebhookHeaders,
  ): ForgeEventEnvelope {
    this.verify(rawBody, headerValue(headers, 'x-hub-signature-256'));
    const deliveryId = headerValue(headers, 'x-github-delivery');
    const event = headerValue(headers, 'x-github-event');
    if (!deliveryId || !event) {
      throw new ForgeError(
        'GitHub delivery identity and event headers are required',
        'INVALID_INPUT',
        { provider: 'github' },
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(rawBody),
      );
    } catch (cause) {
      throw new ForgeError(
        'GitHub webhook body is not valid UTF-8 JSON',
        'INVALID_INPUT',
        { cause, provider: 'github' },
      );
    }
    return normalizeGitHubWebhook(deliveryId, event, payload, this.now());
  }
}
