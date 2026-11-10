import { ForgeError } from '../forge/errors.js';
import type { ForgeRateLimit, ForgeTransport } from '../forge/types.js';
import { type GitHubTokenSource, GitHubTransport } from './transport.js';

/** Combined CI state of a repository's default-branch head commit. */
export type GitHubCiState = 'success' | 'failure' | 'pending' | 'none';

/** Latest published (non-draft, non-prerelease) release of a repository. */
export interface GitHubLatestRelease {
  tag: string;
  /** ISO-8601 publication time, or null when GitHub reports none. */
  publishedAt: string | null;
  url: string;
}

/** Read-only activity summary of one repository in an organization. */
export interface GitHubRepositorySummary {
  owner: string;
  name: string;
  description: string | null;
  /** Null for empty repositories that have no default branch yet. */
  defaultBranch: string | null;
  url: string;
  isPrivate: boolean;
  archived: boolean;
  /** ISO-8601 time of the last push, or null if never pushed. */
  pushedAt: string | null;
  openPullRequestCount: number;
  latestRelease: GitHubLatestRelease | null;
  /** Rolled-up checks and statuses on the default-branch head commit. */
  ciState: GitHubCiState;
}

/** Options for {@link listOrganizationRepositories}. */
export interface ListOrganizationRepositoriesOptions {
  /** Organization (or user) login whose repositories are listed. */
  owner: string;
  /** Read-only token (or lazy token source). Ignored when `transport` is set. */
  token?: GitHubTokenSource;
  /** GitHub API base URL. Defaults to https://api.github.com. */
  baseUrl?: string;
  /** Fetch override, mainly for tests. Ignored when `transport` is set. */
  fetch?: typeof globalThis.fetch;
  /** Pre-built transport, for example from a GitHub App installation. */
  transport?: ForgeTransport;
  /** Repositories per GraphQL page, 1-100. Defaults to 50. */
  pageSize?: number;
  /** Safety cap on GraphQL pages fetched. Defaults to 100. */
  maxPages?: number;
  signal?: AbortSignal;
}

/** Repositories plus how many GraphQL requests were spent fetching them. */
export interface OrganizationRepositoryListing {
  repositories: GitHubRepositorySummary[];
  /** Number of GraphQL requests issued (one per page). */
  requests: number;
  /** Rate-limit headers from the final response, when present. */
  rateLimit?: ForgeRateLimit;
}

const QUERY = `query ListOrganizationRepositories($login: String!, $pageSize: Int!, $cursor: String) {
  repositoryOwner(login: $login) {
    repositories(first: $pageSize, after: $cursor, ownerAffiliations: [OWNER], orderBy: { field: NAME, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        description
        url
        isPrivate
        isArchived
        pushedAt
        owner { login }
        defaultBranchRef {
          name
          target { ... on Commit { statusCheckRollup { state } } }
        }
        pullRequests(states: OPEN) { totalCount }
        latestRelease { tagName publishedAt url }
      }
    }
  }
}`;

interface GraphQLRepositoryNode {
  name: string;
  description?: string | null;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  pushedAt?: string | null;
  owner: { login: string };
  defaultBranchRef?: {
    name: string;
    target?: { statusCheckRollup?: { state?: string } | null } | null;
  } | null;
  pullRequests?: { totalCount: number } | null;
  latestRelease?: {
    tagName: string;
    publishedAt?: string | null;
    url: string;
  } | null;
}

interface GraphQLResponse {
  data?: {
    repositoryOwner: {
      repositories: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<GraphQLRepositoryNode | null>;
      };
    } | null;
  } | null;
  errors?: Array<{ message?: string; type?: string }>;
}

function ciState(state: string | undefined): GitHubCiState {
  switch (state) {
    case 'SUCCESS':
      return 'success';
    case 'FAILURE':
    case 'ERROR':
      return 'failure';
    case 'PENDING':
    case 'EXPECTED':
      return 'pending';
    default:
      return 'none';
  }
}

function summarize(node: GraphQLRepositoryNode): GitHubRepositorySummary {
  return {
    owner: node.owner.login,
    name: node.name,
    description: node.description ?? null,
    defaultBranch: node.defaultBranchRef?.name ?? null,
    url: node.url,
    isPrivate: node.isPrivate,
    archived: node.isArchived,
    pushedAt: node.pushedAt ?? null,
    openPullRequestCount: node.pullRequests?.totalCount ?? 0,
    latestRelease: node.latestRelease
      ? {
          tag: node.latestRelease.tagName,
          publishedAt: node.latestRelease.publishedAt ?? null,
          url: node.latestRelease.url,
        }
      : null,
    ciState: ciState(node.defaultBranchRef?.target?.statusCheckRollup?.state),
  };
}

/**
 * Lists every repository of an organization, archived included, with an
 * activity summary, using one GraphQL request per page of repositories.
 * Read-only: works with a token that has read access to repository metadata,
 * pull requests, and checks/statuses.
 * @param options Owner login, credentials, and paging controls.
 * @returns Repository summaries ordered by name, plus request accounting.
 * @throws {ForgeError} When the owner is missing, GraphQL reports errors, or
 * the transport fails (including rate limiting).
 */
export async function listOrganizationRepositories(
  options: ListOrganizationRepositoriesOptions,
): Promise<OrganizationRepositoryListing> {
  if (!options.owner) {
    throw new ForgeError('Organization owner is required', 'INVALID_INPUT', {
      provider: 'github',
    });
  }
  let transport = options.transport;
  if (!transport) {
    if (!options.token) {
      throw new ForgeError(
        'A GitHub token or transport is required',
        'CONFIGURATION_ERROR',
        { provider: 'github' },
      );
    }
    transport = new GitHubTransport({
      token: options.token,
      baseUrl: options.baseUrl,
      fetch: options.fetch,
    });
  }
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const maxPages = Math.max(1, options.maxPages ?? 100);

  const repositories: GitHubRepositorySummary[] = [];
  let cursor: string | null = null;
  let requests = 0;
  let rateLimit: ForgeRateLimit | undefined;

  for (;;) {
    const response: Awaited<ReturnType<ForgeTransport['request']>> =
      await transport.request<GraphQLResponse>({
        method: 'POST',
        path: '/graphql',
        body: {
          query: QUERY,
          variables: { login: options.owner, pageSize, cursor },
        },
        signal: options.signal,
      });
    requests += 1;
    rateLimit = response.metadata.rateLimit ?? rateLimit;
    const body = response.data as GraphQLResponse;

    if (body?.errors?.length) {
      const messages = body.errors.map((e) => e.message ?? e.type).join('; ');
      const notFound = body.errors.every((e) => e.type === 'NOT_FOUND');
      throw new ForgeError(
        `GitHub GraphQL error: ${messages}`,
        notFound ? 'NOT_FOUND' : 'PROVIDER_ERROR',
        {
          provider: 'github',
          status: response.metadata.status,
          requestId: response.metadata.requestId,
          rateLimit,
          details: body.errors,
        },
      );
    }
    const owner = body?.data?.repositoryOwner;
    if (!owner) {
      throw new ForgeError(
        `GitHub owner not found: ${options.owner}`,
        'NOT_FOUND',
        { provider: 'github', requestId: response.metadata.requestId },
      );
    }
    for (const node of owner.repositories.nodes) {
      if (node) repositories.push(summarize(node));
    }
    const { hasNextPage, endCursor } = owner.repositories.pageInfo;
    if (!hasNextPage || !endCursor) break;
    if (requests >= maxPages) {
      throw new ForgeError(
        `Organization listing exceeded maxPages (${maxPages})`,
        'INVALID_INPUT',
        { provider: 'github' },
      );
    }
    cursor = endCursor;
  }

  return { repositories, requests, rateLimit };
}
