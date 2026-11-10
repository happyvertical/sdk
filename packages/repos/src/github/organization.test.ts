import { describe, expect, it, vi } from 'vitest';
import type { ForgeError } from '../forge/errors.js';
import { listOrganizationRepositories } from './organization.js';

function node(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    description: `${name} desc`,
    url: `https://github.com/acme/${name}`,
    isPrivate: false,
    isArchived: false,
    pushedAt: '2026-11-01T00:00:00Z',
    owner: { login: 'acme' },
    defaultBranchRef: {
      name: 'main',
      target: { statusCheckRollup: { state: 'SUCCESS' } },
    },
    pullRequests: { totalCount: 3 },
    latestRelease: {
      tagName: 'v1.0.0',
      publishedAt: '2026-10-01T00:00:00Z',
      url: `https://github.com/acme/${name}/releases/tag/v1.0.0`,
    },
    ...over,
  };
}

function page(nodes: unknown[], endCursor: string | null) {
  return new Response(
    JSON.stringify({
      data: {
        repositoryOwner: {
          repositories: {
            pageInfo: { hasNextPage: endCursor !== null, endCursor },
            nodes,
          },
        },
      },
    }),
    { status: 200, headers: { 'x-ratelimit-remaining': '4990' } },
  );
}

describe('listOrganizationRepositories', () => {
  it('paginates and normalizes repositories', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          [
            node('a'),
            node('b', {
              isArchived: true,
              isPrivate: true,
              description: null,
              pushedAt: null,
              latestRelease: null,
              pullRequests: { totalCount: 0 },
              defaultBranchRef: {
                name: 'trunk',
                target: { statusCheckRollup: { state: 'ERROR' } },
              },
            }),
          ],
          'cursor-1',
        ),
      )
      .mockResolvedValueOnce(
        page(
          [
            node('c', { defaultBranchRef: null }),
            node('d', {
              defaultBranchRef: {
                name: 'main',
                target: { statusCheckRollup: { state: 'EXPECTED' } },
              },
            }),
            node('e', {
              defaultBranchRef: { name: 'main', target: {} },
            }),
          ],
          null,
        ),
      );

    const result = await listOrganizationRepositories({
      owner: 'acme',
      token: 'ro-token',
      fetch,
      pageSize: 2,
    });

    expect(result.requests).toBe(2);
    expect(result.rateLimit?.remaining).toBe(4990);
    expect(result.repositories.map((r) => r.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(result.repositories[0]).toEqual({
      owner: 'acme',
      name: 'a',
      description: 'a desc',
      defaultBranch: 'main',
      url: 'https://github.com/acme/a',
      isPrivate: false,
      archived: false,
      pushedAt: '2026-11-01T00:00:00Z',
      openPullRequestCount: 3,
      latestRelease: {
        tag: 'v1.0.0',
        publishedAt: '2026-10-01T00:00:00Z',
        url: 'https://github.com/acme/a/releases/tag/v1.0.0',
      },
      ciState: 'success',
    });
    expect(result.repositories[1]).toMatchObject({
      archived: true,
      isPrivate: true,
      description: null,
      pushedAt: null,
      latestRelease: null,
      openPullRequestCount: 0,
      defaultBranch: 'trunk',
      ciState: 'failure',
    });
    expect(result.repositories[2]).toMatchObject({
      defaultBranch: null,
      ciState: 'none',
    });
    expect(result.repositories[3].ciState).toBe('pending');
    expect(result.repositories[4].ciState).toBe('none');

    const [url, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/graphql');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer ro-token',
    );
    expect(JSON.parse(init.body as string).variables).toEqual({
      login: 'acme',
      pageSize: 2,
      cursor: 'cursor-1',
    });
  });

  it('throws NOT_FOUND for an unknown owner', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { repositoryOwner: null } }), {
          status: 200,
        }),
    );
    await expect(
      listOrganizationRepositories({ owner: 'nope', token: 't', fetch }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('surfaces GraphQL errors returned with HTTP 200', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ errors: [{ message: 'Bad credentials' }] }),
          { status: 200 },
        ),
    );
    const error = (await listOrganizationRepositories({
      owner: 'acme',
      token: 't',
      fetch,
    }).catch((e) => e)) as ForgeError;
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.message).toContain('Bad credentials');
  });

  it('maps HTTP rate limiting and enforces maxPages', async () => {
    const limited = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'rate limited' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        }),
    );
    await expect(
      listOrganizationRepositories({
        owner: 'acme',
        token: 't',
        fetch: limited,
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true });

    const endless = vi.fn(async () => page([node('a')], 'more'));
    await expect(
      listOrganizationRepositories({
        owner: 'acme',
        token: 't',
        fetch: endless,
        maxPages: 2,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(endless).toHaveBeenCalledTimes(2);
  });

  it('requires owner and credentials', async () => {
    await expect(
      listOrganizationRepositories({ owner: '', token: 't' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      listOrganizationRepositories({ owner: 'acme' }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
  });
});
