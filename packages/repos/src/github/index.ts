/**
 * GitHub repository implementation
 */

import { GraphQLClient, type IGraphQLClient } from '@happyvertical/graphql';
import type {
  CheckRun,
  CommitStatus,
  CreateCheckRunInput,
  CreateCommitStatusInput,
  UpdateCheckRunInput,
} from '../forge/types.js';
import type {
  Branch,
  Comment,
  CreateFromTemplateOptions,
  CreateIssueInput,
  CreatePRInput,
  IRepository,
  Issue,
  Label,
  MergeMethod,
  PullRequest,
  Repository,
  RepositoryConfig,
  SearchFilters,
  UpdateIssueInput,
} from '../types.js';
import { GitHubRest } from './rest.js';

/**
 * GitHub repository implementation
 */
export class GitHubRepository implements IRepository {
  private rest: GitHubRest;
  private graphql: IGraphQLClient;
  private owner: string;
  private repo: string;

  constructor(config: RepositoryConfig) {
    if (config.type !== 'github') {
      throw new Error('Invalid config type for GitHubRepository');
    }

    this.owner = config.owner;
    this.repo = config.repo;
    this.rest = new GitHubRest({
      token: config.token,
      baseUrl: config.baseUrl,
    });
    this.graphql = new GraphQLClient({
      endpoint: config.baseUrl
        ? `${config.baseUrl}/graphql`
        : 'https://api.github.com/graphql',
      token: config.token,
    });
  }

  // Repository Info
  async getRepository(): Promise<Repository> {
    const data = (await this.rest.get(`/repos/${this.owner}/${this.repo}`)) as {
      name: string;
      owner: { login: string };
      description: string;
      default_branch: string;
      html_url: string;
      private: boolean;
    };

    return {
      owner: data.owner.login,
      name: data.name,
      description: data.description,
      defaultBranch: data.default_branch,
      url: data.html_url,
      isPrivate: data.private,
    };
  }

  // Issues
  async getIssue(number: number): Promise<Issue> {
    const data = (await this.rest.get(
      `/repos/${this.owner}/${this.repo}/issues/${number}`,
    )) as {
      number: number;
      node_id: string;
      title: string;
      body: string | null;
      state: string;
      labels: Array<{ name: string; color: string; description: string }>;
      assignees: Array<{ login: string; id: number; type: string }>;
      user: { login: string; id: number; type: string };
      created_at: string;
      updated_at: string;
      closed_at: string | null;
      html_url: string;
      comments: number;
    };

    return {
      number: data.number,
      id: data.node_id,
      title: data.title,
      body: data.body || '',
      state: data.state === 'open' ? 'open' : 'closed',
      labels: data.labels.map((l) => ({
        name: l.name,
        color: l.color,
        description: l.description,
      })),
      assignees: data.assignees.map((a) => ({
        login: a.login,
        id: String(a.id),
        type: a.type === 'Bot' ? 'Bot' : 'User',
      })),
      author: {
        login: data.user.login,
        id: String(data.user.id),
        type: data.user.type === 'Bot' ? 'Bot' : 'User',
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
      url: data.html_url,
      commentsCount: data.comments,
    };
  }

  async createIssue(data: CreateIssueInput): Promise<Issue> {
    const result = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/issues`,
      data,
    )) as ReturnType<typeof this.getIssue> extends Promise<infer T> ? T : never;
    return this.getIssue(result.number);
  }

  async updateIssue(number: number, data: UpdateIssueInput): Promise<Issue> {
    await this.rest.patch(
      `/repos/${this.owner}/${this.repo}/issues/${number}`,
      data,
    );
    return this.getIssue(number);
  }

  async closeIssue(number: number): Promise<void> {
    await this.updateIssue(number, { state: 'closed' });
  }

  // Labels
  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.rest.post(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`,
      { labels },
    );
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    const encodedLabel = encodeURIComponent(label);
    await this.rest.delete(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${encodedLabel}`,
    );
  }

  async createLabel(label: Label): Promise<void> {
    await this.rest.post(`/repos/${this.owner}/${this.repo}/labels`, label);
  }

  async updateLabel(name: string, label: Label): Promise<void> {
    await this.rest.patch(
      `/repos/${this.owner}/${this.repo}/labels/${encodeURIComponent(name)}`,
      label,
    );
  }

  async listLabels(): Promise<Label[]> {
    const data = (await this.rest.get(
      `/repos/${this.owner}/${this.repo}/labels`,
    )) as Array<{ name: string; color: string; description: string }>;

    return data.map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description,
    }));
  }

  // Comments
  async addComment(issueNumber: number, body: string): Promise<Comment> {
    const data = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
      { body },
    )) as {
      id: number;
      body: string;
      user: { login: string; id: number; type: string };
      created_at: string;
      updated_at: string;
      html_url: string;
    };

    return {
      id: String(data.id),
      body: data.body,
      author: {
        login: data.user.login,
        id: String(data.user.id),
        type: data.user.type === 'Bot' ? 'Bot' : 'User',
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      url: data.html_url,
    };
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    const data = (await this.rest.patch(
      `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`,
      { body },
    )) as ReturnType<typeof this.addComment> extends Promise<infer T>
      ? T
      : never;
    return data as Comment;
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.rest.delete(
      `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`,
    );
  }

  async listComments(issueNumber: number): Promise<Comment[]> {
    const data = (await this.rest.get(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`,
    )) as Array<{
      id: number;
      body: string;
      user: { login: string; id: number; type: string };
      created_at: string;
      updated_at: string;
      html_url: string;
    }>;

    return data.map((c) => ({
      id: String(c.id),
      body: c.body,
      author: {
        login: c.user.login,
        id: String(c.user.id),
        type: c.user.type === 'Bot' ? 'Bot' : 'User',
      },
      createdAt: new Date(c.created_at),
      updatedAt: new Date(c.updated_at),
      url: c.html_url,
    }));
  }

  // Assignments
  async assignIssue(issueNumber: number, assignees: string[]): Promise<void> {
    await this.rest.post(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/assignees`,
      { assignees },
    );
  }

  async unassignIssue(issueNumber: number, assignees: string[]): Promise<void> {
    await this.rest.delete(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/assignees`,
    );
  }

  // Pull Requests
  async getPullRequest(number: number): Promise<PullRequest> {
    const issue = await this.getIssue(number);
    const data = (await this.rest.get(
      `/repos/${this.owner}/${this.repo}/pulls/${number}`,
    )) as {
      head: { ref: string };
      base: { ref: string };
      merged: boolean;
      merged_at: string | null;
      mergeable: boolean;
      draft: boolean;
    };

    return {
      ...issue,
      headRef: data.head.ref,
      baseRef: data.base.ref,
      merged: data.merged,
      mergedAt: data.merged_at ? new Date(data.merged_at) : undefined,
      mergeable: data.mergeable,
      draft: data.draft,
    };
  }

  async createPullRequest(data: CreatePRInput): Promise<PullRequest> {
    const result = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/pulls`,
      {
        title: data.title,
        body: data.body,
        head: data.headRef,
        base: data.baseRef,
        draft: data.draft,
      },
    )) as { number: number };
    return this.getPullRequest(result.number);
  }

  async mergePullRequest(number: number, method?: MergeMethod): Promise<void> {
    await this.rest.put(
      `/repos/${this.owner}/${this.repo}/pulls/${number}/merge`,
      {
        merge_method: method || 'merge',
      },
    );
  }

  // Search
  async searchIssues(query: string, filters?: SearchFilters): Promise<Issue[]> {
    let searchQuery = `${query} repo:${this.owner}/${this.repo}`;

    if (filters?.state) {
      searchQuery += ` state:${filters.state}`;
    }
    if (filters?.labels) {
      searchQuery += ` ${filters.labels.map((l) => `label:"${l}"`).join(' ')}`;
    }
    if (filters?.author) {
      searchQuery += ` author:${filters.author}`;
    }
    if (filters?.assignee) {
      searchQuery += ` assignee:${filters.assignee}`;
    }

    const params = new URLSearchParams({
      q: searchQuery,
      sort: filters?.sort || 'created',
      order: filters?.order || 'desc',
      per_page: String(filters?.limit || 30),
    });

    const data = (await this.rest.get(`/search/issues?${params}`)) as {
      items: Array<{
        number: number;
      }>;
    };

    return Promise.all(data.items.map((item) => this.getIssue(item.number)));
  }

  // Node ID resolution
  async getIssueNodeId(issueNumber: number): Promise<string> {
    const issue = await this.getIssue(issueNumber);
    return issue.id;
  }

  async getPRNodeId(prNumber: number): Promise<string> {
    const pr = await this.getPullRequest(prNumber);
    return pr.id;
  }

  // Branch Management
  async createBranch(name: string, fromRef: string): Promise<Branch> {
    // First get the SHA for the reference
    const refData = (await this.rest.get(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${fromRef}`,
    )) as { object: { sha: string } };

    // Create the new branch
    await this.rest.post(`/repos/${this.owner}/${this.repo}/git/refs`, {
      ref: `refs/heads/${name}`,
      sha: refData.object.sha,
    });

    return {
      name,
      sha: refData.object.sha,
      protected: false,
    };
  }

  async deleteBranch(name: string): Promise<void> {
    await this.rest.delete(
      `/repos/${this.owner}/${this.repo}/git/refs/heads/${name}`,
    );
  }

  async getBranch(name: string): Promise<Branch | null> {
    try {
      const data = (await this.rest.get(
        `/repos/${this.owner}/${this.repo}/branches/${encodeURIComponent(name)}`,
      )) as {
        name: string;
        commit: { sha: string };
        protected: boolean;
      };

      return {
        name: data.name,
        sha: data.commit.sha,
        protected: data.protected,
      };
    } catch (error) {
      // Return null if branch not found (404)
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }

  // PR Draft/Review
  async markPRReady(prNumber: number): Promise<void> {
    const pr = await this.getPullRequest(prNumber);
    const mutation = `
      mutation($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: {
          pullRequestId: $pullRequestId
        }) {
          pullRequest {
            id
          }
        }
      }
    `;
    await this.graphql.mutate(mutation, { pullRequestId: pr.id });
  }

  async convertPRToDraft(prNumber: number): Promise<void> {
    const pr = await this.getPullRequest(prNumber);
    const mutation = `
      mutation($pullRequestId: ID!) {
        convertPullRequestToDraft(input: {
          pullRequestId: $pullRequestId
        }) {
          pullRequest {
            id
          }
        }
      }
    `;
    await this.graphql.mutate(mutation, { pullRequestId: pr.id });
  }

  async requestReview(prNumber: number, reviewers: string[]): Promise<void> {
    await this.rest.post(
      `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/requested_reviewers`,
      { reviewers },
    );
  }

  // Workflow
  async triggerWorkflow(
    workflowId: string,
    ref: string,
    inputs?: Record<string, string>,
  ): Promise<void> {
    await this.rest.post(
      `/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/dispatches`,
      { ref, inputs: inputs || {} },
    );
  }

  // Linking
  async findPRsForIssue(issueNumber: number): Promise<PullRequest[]> {
    // Search for PRs that reference this issue with closing keywords
    const keywords = ['closes', 'fixes', 'resolves'];
    const searchTerms = keywords
      .map((k) => `${k} #${issueNumber}`)
      .join(' OR ');
    const query = `is:pr repo:${this.owner}/${this.repo} ${searchTerms}`;

    const data = (await this.rest.get(
      `/search/issues?q=${encodeURIComponent(query)}`,
    )) as {
      items: Array<{ number: number }>;
    };

    return Promise.all(
      data.items.map((item) => this.getPullRequest(item.number)),
    );
  }

  async findIssueForPR(prNumber: number): Promise<Issue | null> {
    const pr = await this.getPullRequest(prNumber);

    // Look for closing keywords in PR body
    const closingPattern = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;
    const matches = [...pr.body.matchAll(closingPattern)];

    if (matches.length === 0) {
      return null;
    }

    // Return the first linked issue
    const issueNumber = Number.parseInt(matches[0][1], 10);
    try {
      return await this.getIssue(issueNumber);
    } catch {
      return null;
    }
  }

  // File Content
  async getFileContent(path: string, ref?: string): Promise<string | null> {
    try {
      const url = `/repos/${this.owner}/${this.repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
      const data = (await this.rest.get(url)) as {
        type: string;
        content?: string;
        encoding?: string;
      };

      if (data.type !== 'file' || !data.content) {
        return null;
      }

      // GitHub returns base64-encoded content
      if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return data.content;
    } catch {
      // 404 means file doesn't exist
      return null;
    }
  }

  async listDirectoryFiles(path: string, ref?: string): Promise<string[]> {
    try {
      const url = `/repos/${this.owner}/${this.repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
      const data = (await this.rest.get(url)) as Array<{
        name: string;
        type: string;
      }>;

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .filter((item) => item.type === 'file')
        .map((item) => item.name);
    } catch {
      // 404 means directory doesn't exist
      return [];
    }
  }

  /**
   * Publishes one GitHub commit status.
   * @param input Exact commit SHA and status attributes.
   * @returns Normalized published status.
   */
  async createCommitStatus(
    input: CreateCommitStatusInput,
  ): Promise<CommitStatus> {
    const data = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/statuses/${encodeURIComponent(input.sha)}`,
      {
        state: input.state,
        context: input.context,
        description: input.description,
        target_url: input.targetUrl,
      },
    )) as Record<string, unknown>;
    return this.mapCommitStatus(data);
  }

  /**
   * Returns complete commit-status history across GitHub pages.
   * @param sha Exact commit SHA.
   * @returns Every normalized status for the commit.
   */
  async listCommitStatuses(sha: string): Promise<readonly CommitStatus[]> {
    const statuses: CommitStatus[] = [];
    let page = 1;
    while (true) {
      const data = (await this.rest.get(
        `/repos/${this.owner}/${this.repo}/commits/${encodeURIComponent(sha)}/statuses?per_page=100&page=${page}`,
      )) as Record<string, unknown>[];
      statuses.push(...data.map((status) => this.mapCommitStatus(status)));
      if (data.length < 100) return statuses;
      page += 1;
    }
  }

  /**
   * Publishes one GitHub check run.
   * @param input Check identity, exact head SHA, state, and output.
   * @returns Normalized published check run.
   */
  async createCheckRun(input: CreateCheckRunInput): Promise<CheckRun> {
    const data = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/check-runs`,
      this.mapCheckRunInput(input),
    )) as Record<string, unknown>;
    return this.mapCheckRun(data);
  }

  /**
   * Changes one GitHub check run.
   * @param id GitHub check-run ID.
   * @param input Attributes to change.
   * @returns Normalized updated check run.
   */
  async updateCheckRun(
    id: string,
    input: UpdateCheckRunInput,
  ): Promise<CheckRun> {
    const data = (await this.rest.patch(
      `/repos/${this.owner}/${this.repo}/check-runs/${encodeURIComponent(id)}`,
      this.mapCheckRunInput(input),
    )) as Record<string, unknown>;
    return this.mapCheckRun(data);
  }

  /**
   * Returns complete GitHub check history, including reruns.
   * @param sha Exact commit SHA.
   * @returns Every normalized check run for the commit.
   */
  async listCheckRuns(sha: string): Promise<readonly CheckRun[]> {
    const checkRuns: CheckRun[] = [];
    let page = 1;
    let totalCount: number | undefined;
    while (true) {
      const data = (await this.rest.get(
        `/repos/${this.owner}/${this.repo}/commits/${encodeURIComponent(sha)}/check-runs?filter=all&per_page=100&page=${page}`,
      )) as {
        check_runs?: Record<string, unknown>[];
        total_count?: number;
      };
      const pageRuns = data.check_runs ?? [];
      totalCount ??= data.total_count;
      checkRuns.push(...pageRuns.map((checkRun) => this.mapCheckRun(checkRun)));
      if (
        pageRuns.length < 100 ||
        (totalCount !== undefined && checkRuns.length >= totalCount)
      ) {
        return checkRuns;
      }
      page += 1;
    }
  }

  private mapCommitStatus(data: Record<string, unknown>): CommitStatus {
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

  private mapCheckRunInput(
    input: CreateCheckRunInput | UpdateCheckRunInput,
  ): Record<string, unknown> {
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

  private mapCheckRun(data: Record<string, unknown>): CheckRun {
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

  // Repository Creation from Template

  /**
   * Create a new repository from this repository as a template.
   *
   * Uses the GitHub "Generate" API: POST /repos/{template_owner}/{template_repo}/generate
   * The current repository (this.owner/this.repo) is used as the template.
   */
  async createRepositoryFromTemplate(
    options: CreateFromTemplateOptions,
  ): Promise<Repository> {
    const data = (await this.rest.post(
      `/repos/${this.owner}/${this.repo}/generate`,
      {
        owner: options.owner,
        name: options.name,
        description: options.description || '',
        private: options.isPrivate ?? true,
        include_all_branches: options.includeAllBranches ?? false,
      },
    )) as {
      name: string;
      owner: { login: string };
      description: string;
      default_branch: string;
      html_url: string;
      private: boolean;
    };

    return {
      owner: data.owner.login,
      name: data.name,
      description: data.description || '',
      defaultBranch: data.default_branch,
      url: data.html_url,
      isPrivate: data.private,
    };
  }
}
