import type {
  CheckRun,
  CommitStatus,
  CreateCheckRunInput,
  CreateCommitStatusInput,
  ForgeOperations,
  ForgePullRequestRef,
  ForgeRepositoryRef,
  ForgeResponse,
  ForgeTransport,
  UpdateCheckRunInput,
} from '../forge/types.js';

/** Repository coordinates and transport for a GitHub forge provider. */
export interface GitHubForgeProviderOptions {
  owner: string;
  repo: string;
  transport: ForgeTransport;
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function normalizeRepository(
  data: Record<string, unknown>,
): ForgeRepositoryRef {
  const owner = (data.owner as { login?: string } | undefined)?.login ?? '';
  const name = typeof data.name === 'string' ? data.name : '';
  return {
    id: data.node_id === undefined ? undefined : String(data.node_id),
    owner,
    name,
    fullName:
      typeof data.full_name === 'string' ? data.full_name : `${owner}/${name}`,
    defaultBranch:
      typeof data.default_branch === 'string' ? data.default_branch : undefined,
    private: typeof data.private === 'boolean' ? data.private : undefined,
    url: typeof data.html_url === 'string' ? data.html_url : undefined,
  };
}

function normalizePullRequest(
  data: Record<string, unknown>,
): ForgePullRequestRef {
  const head = (data.head ?? {}) as Record<string, unknown>;
  const base = (data.base ?? {}) as Record<string, unknown>;
  return {
    id: data.node_id === undefined ? undefined : String(data.node_id),
    number: Number(data.number),
    state: data.state === 'closed' ? 'closed' : 'open',
    draft: typeof data.draft === 'boolean' ? data.draft : undefined,
    headSha: String(head.sha ?? ''),
    headRef: typeof head.ref === 'string' ? head.ref : undefined,
    baseSha: typeof base.sha === 'string' ? base.sha : undefined,
    baseRef: typeof base.ref === 'string' ? base.ref : undefined,
    merged: typeof data.merged === 'boolean' ? data.merged : undefined,
    mergeCommitSha:
      typeof data.merge_commit_sha === 'string'
        ? data.merge_commit_sha
        : undefined,
    url: typeof data.html_url === 'string' ? data.html_url : undefined,
  };
}

function normalizeStatus(data: Record<string, unknown>): CommitStatus {
  return {
    id: String(data.id ?? data.node_id ?? ''),
    sha: String(data.sha ?? ''),
    state: String(data.state ?? ''),
    context: String(data.context ?? ''),
    description:
      typeof data.description === 'string' ? data.description : undefined,
    targetUrl:
      typeof data.target_url === 'string' ? data.target_url : undefined,
    createdAt:
      typeof data.created_at === 'string'
        ? new Date(data.created_at)
        : undefined,
    raw: data,
  };
}

function normalizeCheck(data: Record<string, unknown>): CheckRun {
  return {
    id: String(data.id ?? data.node_id ?? ''),
    name: String(data.name ?? ''),
    headSha: String(data.head_sha ?? ''),
    status: (data.status ?? 'queued') as CheckRun['status'],
    conclusion:
      typeof data.conclusion === 'string'
        ? (data.conclusion as CheckRun['conclusion'])
        : undefined,
    detailsUrl:
      typeof data.details_url === 'string' ? data.details_url : undefined,
    externalId:
      typeof data.external_id === 'string' ? data.external_id : undefined,
    startedAt:
      typeof data.started_at === 'string'
        ? new Date(data.started_at)
        : undefined,
    completedAt:
      typeof data.completed_at === 'string'
        ? new Date(data.completed_at)
        : undefined,
    raw: data,
  };
}

function checkInput(input: CreateCheckRunInput | UpdateCheckRunInput) {
  return {
    ...('name' in input ? { name: input.name } : {}),
    ...('headSha' in input ? { head_sha: input.headSha } : {}),
    status: input.status,
    conclusion: input.conclusion,
    details_url: input.detailsUrl,
    external_id: input.externalId,
    started_at:
      input.startedAt instanceof Date
        ? input.startedAt.toISOString()
        : input.startedAt,
    completed_at:
      input.completedAt instanceof Date
        ? input.completedAt.toISOString()
        : input.completedAt,
    output: input.output,
  };
}

/**
 * Repository-scoped GitHub implementation of provider-neutral forge operations.
 * Every operation may throw `ForgeError` for transport or provider failures.
 */
export class GitHubForgeProvider implements ForgeOperations {
  private readonly transport: ForgeTransport;
  private readonly path: string;

  /**
   * Creates a repository-scoped GitHub forge provider.
   * @param options Repository coordinates and authenticated transport.
   */
  constructor(options: GitHubForgeProviderOptions) {
    this.transport = options.transport;
    this.path = repositoryPath(options.owner, options.repo);
  }

  /** @returns Normalized repository data and request metadata. */
  async getRepository(): Promise<ForgeResponse<ForgeRepositoryRef>> {
    const response = await this.transport.request<Record<string, unknown>>({
      method: 'GET',
      path: this.path,
    });
    return { ...response, data: normalizeRepository(response.data) };
  }

  /**
   * Returns one normalized pull request.
   * @param number Repository-local pull-request number.
   * @returns Pull-request data and request metadata.
   * @throws {ForgeError} When GitHub rejects the request.
   */
  async getPullRequest(
    number: number,
  ): Promise<ForgeResponse<ForgePullRequestRef>> {
    const response = await this.transport.request<Record<string, unknown>>({
      method: 'GET',
      path: `${this.path}/pulls/${number}`,
    });
    return { ...response, data: normalizePullRequest(response.data) };
  }

  /**
   * Lists every raw provider review for one pull request.
   * @param number Repository-local pull-request number.
   * @returns All reviews and final-page request metadata.
   */
  listPullRequestReviews(
    number: number,
  ): Promise<ForgeResponse<readonly unknown[]>> {
    return this.paginate(
      `${this.path}/pulls/${number}/reviews`,
      (data) => data as unknown[],
    );
  }

  /**
   * Returns one raw provider commit payload.
   * @param sha Exact commit SHA.
   * @returns Commit payload and request metadata.
   */
  getCommit(sha: string): Promise<ForgeResponse<unknown>> {
    return this.transport.request({
      method: 'GET',
      path: `${this.path}/commits/${encodeURIComponent(sha)}`,
    });
  }

  /**
   * Returns complete normalized commit-status history.
   * @param sha Exact commit SHA.
   * @returns All status pages and final-page request metadata.
   */
  async listCommitStatuses(
    sha: string,
  ): Promise<ForgeResponse<readonly CommitStatus[]>> {
    return this.paginate(
      `${this.path}/commits/${encodeURIComponent(sha)}/statuses`,
      (data) => (data as Record<string, unknown>[]).map(normalizeStatus),
    );
  }

  /**
   * Publishes one commit status.
   * @param input Exact SHA and status attributes.
   * @returns Published status and request metadata.
   */
  async createCommitStatus(
    input: CreateCommitStatusInput,
  ): Promise<ForgeResponse<CommitStatus>> {
    const response = await this.transport.request<Record<string, unknown>>({
      method: 'POST',
      path: `${this.path}/statuses/${encodeURIComponent(input.sha)}`,
      body: {
        state: input.state,
        context: input.context,
        description: input.description,
        target_url: input.targetUrl,
      },
    });
    return { ...response, data: normalizeStatus(response.data) };
  }

  /**
   * Returns all normalized check runs, including reruns.
   * @param sha Exact commit SHA.
   * @returns All check pages and final-page request metadata.
   */
  async listCheckRuns(
    sha: string,
  ): Promise<ForgeResponse<readonly CheckRun[]>> {
    return this.paginate(
      `${this.path}/commits/${encodeURIComponent(sha)}/check-runs?filter=all`,
      (data) =>
        (
          (data as { check_runs?: Record<string, unknown>[] }).check_runs ?? []
        ).map(normalizeCheck),
      (data) => (data as { total_count?: number }).total_count,
    );
  }

  /**
   * Publishes one check run.
   * @param input Check identity, exact head SHA, state, and output.
   * @returns Published check and request metadata.
   */
  async createCheckRun(
    input: CreateCheckRunInput,
  ): Promise<ForgeResponse<CheckRun>> {
    const response = await this.transport.request<Record<string, unknown>>({
      method: 'POST',
      path: `${this.path}/check-runs`,
      body: checkInput(input),
    });
    return { ...response, data: normalizeCheck(response.data) };
  }

  /**
   * Changes one check run by provider ID.
   * @param id GitHub check-run ID.
   * @param input Attributes to change.
   * @returns Updated check and request metadata.
   */
  async updateCheckRun(
    id: string,
    input: UpdateCheckRunInput,
  ): Promise<ForgeResponse<CheckRun>> {
    const response = await this.transport.request<Record<string, unknown>>({
      method: 'PATCH',
      path: `${this.path}/check-runs/${encodeURIComponent(id)}`,
      body: checkInput(input),
    });
    return { ...response, data: normalizeCheck(response.data) };
  }

  /**
   * Lists raw deployment payloads using narrow filters.
   * @param options Optional SHA, environment, and result limit.
   * @returns Matching deployments and request metadata.
   */
  listDeployments(
    options: { sha?: string; environment?: string; limit?: number } = {},
  ): Promise<ForgeResponse<unknown[]>> {
    const params = new URLSearchParams();
    if (options.sha) params.set('sha', options.sha);
    if (options.environment) params.set('environment', options.environment);
    params.set('per_page', String(options.limit ?? 30));
    return this.transport.request({
      method: 'GET',
      path: `${this.path}/deployments?${params}`,
    });
  }

  /**
   * Returns one raw deployment payload.
   * @param id GitHub deployment ID.
   * @returns Deployment payload and request metadata.
   */
  getDeployment(id: string): Promise<ForgeResponse<unknown>> {
    return this.transport.request({
      method: 'GET',
      path: `${this.path}/deployments/${encodeURIComponent(id)}`,
    });
  }

  private async paginate<T>(
    path: string,
    items: (data: unknown) => readonly T[],
    totalCount?: (data: unknown) => number | undefined,
  ): Promise<ForgeResponse<readonly T[]>> {
    const separator = path.includes('?') ? '&' : '?';
    const collected: T[] = [];
    let page = 1;
    let response: ForgeResponse<unknown>;
    let providerTotal: number | undefined;
    do {
      response = await this.transport.request({
        method: 'GET',
        path: `${path}${separator}per_page=100&page=${page}`,
      });
      const pageItems = items(response.data);
      collected.push(...pageItems);
      providerTotal ??= totalCount?.(response.data);
      page += 1;
      if (pageItems.length < 100) break;
    } while (providerTotal === undefined || collected.length < providerTotal);

    return {
      data: collected,
      metadata: {
        ...response.metadata,
        pagination: {
          pages: page - 1,
          totalCount: providerTotal ?? collected.length,
        },
      },
    };
  }
}
