/**
 * Core types for repository operations
 */

export interface User {
  login: string;
  id: string;
  type: 'User' | 'Bot';
  avatarUrl?: string;
  url?: string;
}

export interface Label {
  name: string;
  color: string;
  description: string;
}

export interface Comment {
  id: string;
  body: string;
  author: User;
  createdAt: Date;
  updatedAt: Date;
  url: string;
}

export interface Issue {
  number: number;
  id: string; // Node ID for GraphQL operations
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Label[];
  assignees: User[];
  author: User;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  url: string;
  commentsCount: number;
}

export interface PullRequest extends Issue {
  headRef: string;
  baseRef: string;
  merged: boolean;
  mergedAt?: Date;
  mergeable: boolean;
  draft: boolean;
}

export interface Repository {
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  url: string;
  isPrivate: boolean;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueInput {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
}

export interface CreatePRInput {
  title: string;
  body?: string;
  headRef: string;
  baseRef: string;
  draft?: boolean;
}

export interface SearchFilters {
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  author?: string;
  assignee?: string;
  limit?: number;
  sort?: 'created' | 'updated' | 'comments';
  order?: 'asc' | 'desc';
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';

/**
 * Repository configuration
 */
export interface RepositoryConfig {
  type: 'github' | 'gitlab' | 'bitbucket' | 'azure';
  owner: string;
  repo: string;
  token: string;
  baseUrl?: string; // For self-hosted instances
}

/**
 * Repository interface - all repository implementations must implement this
 */
export interface IRepository {
  // Repository Info
  getRepository(): Promise<Repository>;

  // Issues
  getIssue(number: number): Promise<Issue>;
  createIssue(data: CreateIssueInput): Promise<Issue>;
  updateIssue(number: number, data: UpdateIssueInput): Promise<Issue>;
  closeIssue(number: number): Promise<void>;

  // Labels
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  removeLabel(issueNumber: number, label: string): Promise<void>;
  createLabel(label: Label): Promise<void>;
  updateLabel(name: string, label: Label): Promise<void>;
  listLabels(): Promise<Label[]>;

  // Comments
  addComment(issueNumber: number, body: string): Promise<Comment>;
  updateComment(commentId: string, body: string): Promise<Comment>;
  deleteComment(commentId: string): Promise<void>;
  listComments(issueNumber: number): Promise<Comment[]>;

  // Assignments
  assignIssue(issueNumber: number, assignees: string[]): Promise<void>;
  unassignIssue(issueNumber: number, assignees: string[]): Promise<void>;

  // Pull Requests
  getPullRequest(number: number): Promise<PullRequest>;
  createPullRequest(data: CreatePRInput): Promise<PullRequest>;
  mergePullRequest(number: number, method?: MergeMethod): Promise<void>;

  // Search
  searchIssues(query: string, filters?: SearchFilters): Promise<Issue[]>;

  // Node ID resolution (for Projects V2 API)
  getIssueNodeId(issueNumber: number): Promise<string>;
  getPRNodeId(prNumber: number): Promise<string>;

  // Branches
  createBranch(name: string, fromRef: string): Promise<Branch>;
  deleteBranch(name: string): Promise<void>;
  getBranch(name: string): Promise<Branch | null>;

  // PR Draft/Review
  markPRReady(prNumber: number): Promise<void>;
  convertPRToDraft(prNumber: number): Promise<void>;
  requestReview(prNumber: number, reviewers: string[]): Promise<void>;

  // Workflow
  triggerWorkflow(
    workflowId: string,
    ref: string,
    inputs?: Record<string, string>,
  ): Promise<void>;

  // Linking
  findPRsForIssue(issueNumber: number): Promise<PullRequest[]>;
  findIssueForPR(prNumber: number): Promise<Issue | null>;

  // File Content
  getFileContent(path: string, ref?: string): Promise<string | null>;
  listDirectoryFiles(path: string, ref?: string): Promise<string[]>;
}
