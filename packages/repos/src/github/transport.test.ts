import { describe, expect, it, vi } from 'vitest';
import type { ForgeError } from '../forge/errors.js';
import { GitHubForgeProvider } from './forge.js';
import { GitHubTransport } from './transport.js';

describe('GitHubTransport', () => {
  it('returns request-scoped rate metadata without shared mutable state', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const requestNumber = url.endsWith('/one') ? 'one' : 'two';
      return new Response(JSON.stringify({ requestNumber }), {
        status: 200,
        headers: {
          'x-github-request-id': requestNumber,
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': requestNumber === 'one' ? '4999' : '4998',
          'x-ratelimit-reset': '1800000000',
        },
      });
    });
    const transport = new GitHubTransport({ token: 'token', fetch });

    const [one, two] = await Promise.all([
      transport.request<{ requestNumber: string }>({
        method: 'GET',
        path: '/one',
      }),
      transport.request<{ requestNumber: string }>({
        method: 'GET',
        path: '/two',
      }),
    ]);

    expect(one.metadata).toMatchObject({
      requestId: 'one',
      rateLimit: { remaining: 4999 },
    });
    expect(two.metadata).toMatchObject({
      requestId: 'two',
      rateLimit: { remaining: 4998 },
    });
  });

  it('throws a structured retryable rate-limit error', async () => {
    const transport = new GitHubTransport({
      token: 'token',
      fetch: vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
            status: 403,
            headers: {
              'retry-after': '2',
              'x-github-request-id': 'rate-request',
              'x-ratelimit-remaining': '0',
            },
          }),
      ),
    });

    await expect(
      transport.request({ method: 'GET', path: '/rate' }),
    ).rejects.toMatchObject<Partial<ForgeError>>({
      code: 'RATE_LIMITED',
      provider: 'github',
      requestId: 'rate-request',
      retryable: true,
      rateLimit: { remaining: 0, retryAfterMs: 2000 },
    });
  });

  it('recognizes GitHub secondary rate limits with Retry-After', async () => {
    const transport = new GitHubTransport({
      token: 'token',
      fetch: vi.fn(async () =>
        Response.json(
          { message: 'You have exceeded a secondary rate limit.' },
          {
            status: 403,
            headers: {
              'retry-after': '10',
              'x-ratelimit-remaining': '4999',
            },
          },
        ),
      ),
    });

    await expect(
      transport.request({ method: 'GET', path: '/secondary-rate' }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      rateLimit: { retryAfterMs: 10_000 },
    });
  });

  it('normalizes provider network failures without leaking credential data', async () => {
    const transport = new GitHubTransport({
      token: 'secret-token',
      fetch: vi.fn(async () => {
        throw new Error('socket closed');
      }),
    });

    const failure = await transport
      .request({ method: 'GET', path: '/network' })
      .catch((error: unknown) => error as ForgeError);
    expect(failure).toMatchObject({
      code: 'TRANSPORT_ERROR',
      retryable: true,
    });
    expect(failure.message).not.toContain('secret-token');
  });
});

describe('GitHubForgeProvider contract', () => {
  it('maps check and status operations while preserving response metadata', async () => {
    const transport = {
      request: vi.fn(async ({ path }: { path: string }) => {
        if (path.endsWith('/check-runs')) {
          return {
            data: {
              id: 9,
              name: 'Work authority',
              head_sha: 'abc',
              status: 'completed',
              conclusion: 'success',
            },
            metadata: { provider: 'github' as const, status: 201 },
          };
        }
        return {
          data: {
            id: 8,
            sha: 'abc',
            state: 'success',
            context: 'work/authority',
          },
          metadata: { provider: 'github' as const, status: 201 },
        };
      }),
    };
    const provider = new GitHubForgeProvider({
      owner: 'happyvertical',
      repo: 'sdk',
      transport,
    });

    const status = await provider.createCommitStatus({
      sha: 'abc',
      state: 'success',
      context: 'work/authority',
    });
    const check = await provider.createCheckRun({
      name: 'Work authority',
      headSha: 'abc',
      status: 'completed',
      conclusion: 'success',
    });

    expect(status).toMatchObject({
      data: { sha: 'abc', context: 'work/authority' },
      metadata: { status: 201 },
    });
    expect(check.data).toMatchObject({
      id: '9',
      headSha: 'abc',
      conclusion: 'success',
    });
    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path: '/repos/happyvertical/sdk/statuses/abc',
        body: {
          state: 'success',
          context: 'work/authority',
          description: undefined,
          target_url: undefined,
        },
      }),
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: '/repos/happyvertical/sdk/check-runs',
        body: expect.objectContaining({
          name: 'Work authority',
          head_sha: 'abc',
          status: 'completed',
          conclusion: 'success',
        }),
      }),
    );
  });

  it('collects every status/check page and includes all check reruns', async () => {
    const request = vi.fn(async ({ path }: { path: string }) => {
      const page = path.includes('page=2') ? 2 : 1;
      if (path.includes('/check-runs')) {
        const count = page === 1 ? 100 : 1;
        return {
          data: {
            total_count: 101,
            check_runs: Array.from({ length: count }, (_, index) => ({
              id: (page - 1) * 100 + index,
              name: `check-${index}`,
              head_sha: 'abc',
              status: 'completed',
            })),
          },
          metadata: { provider: 'github' as const, status: 200 },
        };
      }
      const count = page === 1 ? 100 : 1;
      return {
        data: Array.from({ length: count }, (_, index) => ({
          id: (page - 1) * 100 + index,
          sha: 'abc',
          state: 'success',
          context: `status-${index}`,
        })),
        metadata: { provider: 'github' as const, status: 200 },
      };
    });
    const provider = new GitHubForgeProvider({
      owner: 'happyvertical',
      repo: 'sdk',
      transport: { request },
    });

    const [statuses, checks] = await Promise.all([
      provider.listCommitStatuses('abc'),
      provider.listCheckRuns('abc'),
    ]);

    expect(statuses.data).toHaveLength(101);
    expect(statuses.metadata.pagination).toEqual({
      pages: 2,
      totalCount: 101,
    });
    expect(checks.data).toHaveLength(101);
    expect(checks.metadata.pagination).toEqual({
      pages: 2,
      totalCount: 101,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining(
          '/check-runs?filter=all&per_page=100&page=1',
        ),
      }),
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('/statuses?per_page=100&page=2'),
      }),
    );
  });
});
