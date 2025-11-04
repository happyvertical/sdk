/**
 * GitHub repository implementation
 */

import type {
  Comment,
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
  User,
} from '../types.js';
import { GitHubGraphQL } from './graphql.js';
import { GitHubRest } from './rest.js';

/**
 * GitHub repository implementation
 */
export class GitHubRepository implements IRepository {
  private rest: GitHubRest;
  private graphql: GitHubGraphQL;
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
    this.graphql = new GitHubGraphQL({ token: config.token });
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
}
