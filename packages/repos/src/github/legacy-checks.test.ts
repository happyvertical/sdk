import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubRepository } from './index.js';

describe('GitHubRepository additive check/status operations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collects complete status and all-rerun check histories', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        paths.push(url);
        const page = url.includes('page=2') ? 2 : 1;
        if (url.includes('/check-runs')) {
          const count = page === 1 ? 100 : 1;
          return Response.json({
            total_count: 101,
            check_runs: Array.from({ length: count }, (_, index) => ({
              id: (page - 1) * 100 + index,
              name: `check-${index}`,
              head_sha: 'abc',
              status: 'completed',
            })),
          });
        }
        const count = page === 1 ? 100 : 1;
        return Response.json(
          Array.from({ length: count }, (_, index) => ({
            id: (page - 1) * 100 + index,
            sha: 'abc',
            state: 'success',
            context: `status-${index}`,
          })),
        );
      }),
    );
    const repository = new GitHubRepository({
      type: 'github',
      owner: 'happyvertical',
      repo: 'sdk',
      token: 'token',
    });

    const [statuses, checks] = await Promise.all([
      repository.listCommitStatuses('abc'),
      repository.listCheckRuns('abc'),
    ]);

    expect(statuses).toHaveLength(101);
    expect(checks).toHaveLength(101);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/statuses?per_page=100&page=2'),
        expect.stringContaining('/check-runs?filter=all&per_page=100&page=2'),
      ]),
    );
  });
});
