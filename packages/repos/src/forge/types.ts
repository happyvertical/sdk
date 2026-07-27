export type ForgeProvider = 'github' | (string & {});

/** Provider quota information captured from one forge response. */
export interface ForgeRateLimit {
  limit?: number;
  remaining?: number;
  used?: number;
  resetAt?: Date;
  retryAfterMs?: number;
}

/** Metadata for the same provider request that produced a response. */
export interface ForgeResponseMetadata {
  provider: ForgeProvider;
  requestId?: string;
  status: number;
  rateLimit?: ForgeRateLimit;
  pagination?: {
    pages: number;
    totalCount?: number;
  };
}

/** Provider data paired with concurrency-safe request metadata. */
export interface ForgeResponse<T> {
  data: T;
  metadata: ForgeResponseMetadata;
}

/** Provider-neutral HTTP request accepted by a forge transport. */
export interface ForgeTransportRequest {
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

/** Executes authenticated provider requests and normalizes their metadata. */
export interface ForgeTransport {
  /**
   * Executes one provider request.
   * @throws {ForgeError} When transport or provider processing fails.
   */
  request<T>(request: ForgeTransportRequest): Promise<ForgeResponse<T>>;
}

/** Provider-neutral repository identity and reconciled attributes. */
export interface ForgeRepositoryRef {
  id?: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
  private?: boolean;
  url?: string;
}

/** Installation identity associated with provider authority. */
export interface ForgeInstallationRef {
  id: string;
  account?: string;
  repositorySelection?: 'all' | 'selected';
}

/** Actor identity supplied by a forge event. */
export interface ForgeActor {
  id?: string;
  login: string;
  type?: string;
}

/** Pull-request identity and exact revision references. */
export interface ForgePullRequestRef {
  id?: string;
  number: number;
  state: 'open' | 'closed';
  draft?: boolean;
  headSha: string;
  headRef?: string;
  baseSha?: string;
  baseRef?: string;
  merged?: boolean;
  mergeCommitSha?: string;
  url?: string;
}

export type ForgeCheckConclusion =
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'skipped'
  | 'stale'
  | 'startup_failure'
  | 'success'
  | 'timed_out';

export type ForgeCheckStatus = 'queued' | 'in_progress' | 'completed';

/** Input for publishing a provider commit status. */
export interface CreateCommitStatusInput {
  sha: string;
  state: 'error' | 'failure' | 'pending' | 'success';
  context: string;
  description?: string;
  targetUrl?: string;
}

/** Normalized provider commit status. */
export interface CommitStatus {
  id: string;
  sha: string;
  state: string;
  context: string;
  description?: string;
  targetUrl?: string;
  createdAt?: Date;
  raw?: unknown;
}

/** Human-readable check-run output published by a forge. */
export interface CheckRunOutput {
  title: string;
  summary: string;
  text?: string;
}

/** Input for publishing a provider check run. */
export interface CreateCheckRunInput {
  name: string;
  headSha: string;
  status?: ForgeCheckStatus;
  conclusion?: ForgeCheckConclusion;
  detailsUrl?: string;
  externalId?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  output?: CheckRunOutput;
}

/** Input for changing an existing provider check run. */
export interface UpdateCheckRunInput
  extends Omit<CreateCheckRunInput, 'name' | 'headSha'> {
  name?: string;
}

/** Normalized provider check run. */
export interface CheckRun {
  id: string;
  name: string;
  headSha: string;
  status: ForgeCheckStatus;
  conclusion?: ForgeCheckConclusion;
  detailsUrl?: string;
  externalId?: string;
  startedAt?: Date;
  completedAt?: Date;
  raw?: unknown;
}

/** Shared discriminator implemented by every normalized observation. */
export interface ForgeObservationBase {
  kind:
    | 'availability'
    | 'check'
    | 'deployment'
    | 'installation'
    | 'merge'
    | 'merge_group'
    | 'pull_request'
    | 'push'
    | 'repository'
    | 'review'
    | 'status'
    | 'unknown';
}

/** Provider health or webhook availability observation. */
export interface ForgeAvailabilityObservation extends ForgeObservationBase {
  kind: 'availability';
  available: boolean;
  message?: string;
}

/** Installation lifecycle or repository-scope observation. */
export interface ForgeInstallationObservation extends ForgeObservationBase {
  kind: 'installation';
  installation: ForgeInstallationRef;
  repositories?: readonly ForgeRepositoryRef[];
}

/** Repository lifecycle or metadata observation. */
export interface ForgeRepositoryObservation extends ForgeObservationBase {
  kind: 'repository';
  repository: ForgeRepositoryRef;
}

/** Pull-request lifecycle or revision observation. */
export interface ForgePullRequestObservation extends ForgeObservationBase {
  kind: 'pull_request';
  pullRequest: ForgePullRequestRef;
}

/** Pull-request review observation tied to an exact commit when available. */
export interface ForgeReviewObservation extends ForgeObservationBase {
  kind: 'review';
  pullRequest: ForgePullRequestRef;
  review: {
    id: string;
    state: string;
    body?: string;
    commitSha?: string;
    submittedAt?: Date;
    author?: ForgeActor;
  };
}

/** Git reference update observation. */
export interface ForgePushObservation extends ForgeObservationBase {
  kind: 'push';
  ref: string;
  beforeSha?: string;
  afterSha: string;
  forced?: boolean;
  created?: boolean;
  deleted?: boolean;
}

/** Commit-status observation. */
export interface ForgeStatusObservation extends ForgeObservationBase {
  kind: 'status';
  status: CommitStatus;
}

/** Check-run or check-suite observation. */
export interface ForgeCheckObservation extends ForgeObservationBase {
  kind: 'check';
  check: CheckRun;
}

/** Merge-queue group observation tied to its synthetic head revision. */
export interface ForgeMergeGroupObservation extends ForgeObservationBase {
  kind: 'merge_group';
  headSha: string;
  headRef?: string;
  baseSha?: string;
  baseRef?: string;
}

/** Completed pull-request merge observation. */
export interface ForgeMergeObservation extends ForgeObservationBase {
  kind: 'merge';
  pullRequest: ForgePullRequestRef;
  mergeCommitSha?: string;
}

/** Deployment or deployment-status observation. */
export interface ForgeDeploymentObservation extends ForgeObservationBase {
  kind: 'deployment';
  deployment: {
    id: string;
    sha?: string;
    ref?: string;
    environment?: string;
    state?: string;
    url?: string;
  };
}

/** Forward-compatible observation for an unsupported provider event. */
export interface ForgeUnknownObservation extends ForgeObservationBase {
  kind: 'unknown';
}

export type ForgeObservation =
  | ForgeAvailabilityObservation
  | ForgeCheckObservation
  | ForgeDeploymentObservation
  | ForgeInstallationObservation
  | ForgeMergeGroupObservation
  | ForgeMergeObservation
  | ForgePullRequestObservation
  | ForgePushObservation
  | ForgeRepositoryObservation
  | ForgeReviewObservation
  | ForgeStatusObservation
  | ForgeUnknownObservation;

/** Verified delivery envelope retaining the parsed provider payload. */
export interface ForgeEventEnvelope<
  TObservation extends ForgeObservation = ForgeObservation,
> {
  provider: ForgeProvider;
  deliveryId: string;
  event: string;
  action?: string;
  occurredAt?: Date;
  receivedAt: Date;
  installation?: ForgeInstallationRef;
  repository?: ForgeRepositoryRef;
  actor?: ForgeActor;
  observation: TObservation;
  /** Original parsed provider payload. Raw request bytes remain caller-owned. */
  raw: unknown;
}

/** Provider-neutral forge reconciliation and check-publishing operations. */
export interface ForgeOperations {
  /** Returns the configured repository. */
  getRepository(): Promise<ForgeResponse<ForgeRepositoryRef>>;
  /** Returns one pull request by repository-local number. */
  getPullRequest(number: number): Promise<ForgeResponse<ForgePullRequestRef>>;
  /** Returns provider review payloads for one pull request. */
  listPullRequestReviews(
    number: number,
  ): Promise<ForgeResponse<readonly unknown[]>>;
  /** Returns one commit payload by SHA. */
  getCommit(sha: string): Promise<ForgeResponse<unknown>>;
  /** Returns complete commit-status history across provider pages. */
  listCommitStatuses(
    sha: string,
  ): Promise<ForgeResponse<readonly CommitStatus[]>>;
  /** Publishes one commit status. */
  createCommitStatus(
    input: CreateCommitStatusInput,
  ): Promise<ForgeResponse<CommitStatus>>;
  /** Returns complete check history, including reruns, across provider pages. */
  listCheckRuns(sha: string): Promise<ForgeResponse<readonly CheckRun[]>>;
  /** Publishes one check run. */
  createCheckRun(input: CreateCheckRunInput): Promise<ForgeResponse<CheckRun>>;
  /** Changes one check run by provider ID. */
  updateCheckRun(
    id: string,
    input: UpdateCheckRunInput,
  ): Promise<ForgeResponse<CheckRun>>;
  /** Lists deployments using narrow optional filters. */
  listDeployments(options?: {
    sha?: string;
    environment?: string;
    limit?: number;
  }): Promise<ForgeResponse<unknown[]>>;
  /** Returns one deployment by provider ID. */
  getDeployment(id: string): Promise<ForgeResponse<unknown>>;
}
