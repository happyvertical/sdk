import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ForgeError } from '../forge/errors.js';
import { createGitHubAppJwt, GitHubAppAuth } from './app.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const privateKeyPem = privateKey
  .export({
    type: 'pkcs8',
    format: 'pem',
  })
  .toString();

describe('GitHub App authentication', () => {
  it('creates a signed, short-lived app JWT', () => {
    const now = new Date('2026-07-27T00:00:00.000Z');
    const jwt = createGitHubAppJwt(
      { appId: 42, privateKey: privateKeyPem },
      now,
    );
    const [header, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: Math.floor(now.getTime() / 1000) - 60,
      exp: Math.floor(now.getTime() / 1000) - 60 + 600,
      iss: '42',
    });
    expect(
      verifySignature(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('isolates concurrent installation credentials and repository authority', async () => {
    const authorizations: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const authorization =
          new Headers(init?.headers).get('authorization') ?? '';
        authorizations.push(`${url}:${authorization}`);
        const match = url.match(/installations\/(\d+)\/access_tokens$/);
        if (match) {
          const id = match[1];
          await new Promise((resolve) =>
            setTimeout(resolve, id === '1' ? 5 : 1),
          );
          return Response.json({
            token: `installation-${id}`,
            expires_at: '2026-07-27T02:00:00.000Z',
          });
        }
        if (url.endsWith('/repos/org/repo-1')) {
          return Response.json({
            name: 'repo-1',
            full_name: 'org/repo-1',
            owner: { login: 'org' },
          });
        }
        if (url.endsWith('/repos/org/repo-2')) {
          return Response.json({
            name: 'repo-2',
            full_name: 'org/repo-2',
            owner: { login: 'org' },
          });
        }
        throw new Error(`Unexpected ${url}`);
      },
    );
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      fetch,
      now: () => new Date('2026-07-27T01:00:00.000Z'),
    });

    const [one, two] = await Promise.all([
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo-1',
      }),
      auth.createInstallationContext({
        installationId: 2,
        owner: 'org',
        repo: 'repo-2',
      }),
    ]);
    await Promise.all([one.forge.getRepository(), two.forge.getRepository()]);

    expect(
      authorizations
        .find((value) => value.includes('/repos/org/repo-1'))
        ?.endsWith(':Bearer installation-1'),
    ).toBe(true);
    expect(
      authorizations
        .find((value) => value.includes('/repos/org/repo-2'))
        ?.endsWith(':Bearer installation-2'),
    ).toBe(true);
  });

  it('coalesces same-installation acquisition and refreshes expired tokens', async () => {
    let now = new Date('2026-07-27T01:00:00.000Z');
    let acquisition = 0;
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const authorization =
          new Headers(init?.headers).get('authorization') ?? '';
        if (url.includes('/access_tokens')) {
          acquisition += 1;
          return Response.json({
            token: `token-${acquisition}`,
            expires_at:
              acquisition === 1
                ? '2026-07-27T01:02:00.000Z'
                : '2026-07-27T02:00:00.000Z',
          });
        }
        if (url.endsWith('/repos/org/repo')) {
          expect(authorization).toBe(`Bearer token-${acquisition}`);
          return Response.json({
            name: 'repo',
            full_name: 'org/repo',
            owner: { login: 'org' },
          });
        }
        throw new Error(`Unexpected ${url}`);
      },
    );
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      fetch,
      now: () => now,
    });

    const [one, two] = await Promise.all([
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo',
      }),
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo',
      }),
    ]);
    expect(acquisition).toBe(1);

    now = new Date('2026-07-27T01:01:30.000Z');
    await Promise.all([one.forge.getRepository(), two.forge.getRepository()]);
    expect(acquisition).toBe(2);
  });

  it('fails closed when an installation lacks repository authority', async () => {
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => new Date('2026-07-27T01:00:00.000Z'),
      fetch: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/access_tokens')) {
          return Response.json({
            token: 'installation-token',
            expires_at: '2026-07-27T02:00:00.000Z',
          });
        }
        return Response.json({ message: 'Not Found' }, { status: 404 });
      }),
    });

    await expect(
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo',
      }),
    ).rejects.toMatchObject<Partial<ForgeError>>({
      code: 'AUTHORITY_MISMATCH',
      status: 404,
    });
  });

  it('preserves retryable provider failures during repository scope checks', async () => {
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => new Date('2026-07-27T01:00:00.000Z'),
      fetch: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/access_tokens')) {
          return Response.json({
            token: 'installation-token',
            expires_at: '2026-07-27T02:00:00.000Z',
          });
        }
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      }),
    });

    await expect(
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 503,
      retryable: true,
    });
  });

  it('revokes a scoped token and permanently closes that local context', async () => {
    let acquisitions = 0;
    let revocations = 0;
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => new Date('2026-07-27T01:00:00.000Z'),
      fetch: vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url.includes('/access_tokens')) {
            acquisitions += 1;
            return Response.json({
              token: `installation-${acquisitions}`,
              expires_at: '2026-07-27T02:00:00.000Z',
            });
          }
          if (url.endsWith('/installation/token')) {
            expect(init?.method).toBe('DELETE');
            revocations += 1;
            return new Response(null, { status: 204 });
          }
          if (url.endsWith('/repos/org/repo')) {
            return Response.json({
              name: 'repo',
              full_name: 'org/repo',
              owner: { login: 'org' },
            });
          }
          throw new Error(`Unexpected ${url}`);
        },
      ),
    });
    const first = await auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo',
    });
    await first.revoke();
    await expect(first.forge.getRepository()).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
    await expect(
      auth.createInstallationContext({
        installationId: 1,
        owner: 'org',
        repo: 'repo',
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });

    expect({ acquisitions, revocations }).toEqual({
      acquisitions: 1,
      revocations: 1,
    });
  });

  it('fails closed locally and permits remote-revocation retry after DELETE fails', async () => {
    let revocations = 0;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/access_tokens')) {
        return Response.json({
          token: 'installation-token',
          expires_at: '2026-07-27T02:00:00.000Z',
        });
      }
      if (url.endsWith('/installation/token')) {
        revocations += 1;
        return revocations === 1
          ? Response.json({ message: 'Unavailable' }, { status: 503 })
          : new Response(null, { status: 204 });
      }
      if (url.endsWith('/repos/org/repo')) {
        return Response.json({
          name: 'repo',
          full_name: 'org/repo',
          owner: { login: 'org' },
        });
      }
      throw new Error(`Unexpected ${url}`);
    });
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => new Date('2026-07-27T01:00:00.000Z'),
      fetch,
    });
    const context = await auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo',
    });

    await expect(context.revoke()).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: true,
    });
    await expect(context.forge.getRepository()).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
    await context.revoke();
    expect(revocations).toBe(2);
  });

  it('revokes every still-live token issued before and after refresh', async () => {
    let now = new Date('2026-07-27T01:00:00.000Z');
    let acquisition = 0;
    const revokedAuthorizations: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const authorization =
          new Headers(init?.headers).get('authorization') ?? '';
        if (url.includes('/access_tokens')) {
          acquisition += 1;
          return Response.json({
            token: `token-${acquisition}`,
            expires_at: '2026-07-27T01:03:00.000Z',
          });
        }
        if (url.endsWith('/installation/token')) {
          revokedAuthorizations.push(authorization);
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/repos/org/repo')) {
          return Response.json({
            name: 'repo',
            full_name: 'org/repo',
            owner: { login: 'org' },
          });
        }
        throw new Error(`Unexpected ${url}`);
      },
    );
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => now,
      fetch,
    });
    const context = await auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo',
    });
    now = new Date('2026-07-27T01:02:30.000Z');
    await context.forge.getRepository();
    await context.revoke();

    expect(revokedAuthorizations.sort()).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
  });

  it('retains a token acquired during revocation when remote DELETE fails', async () => {
    let now = new Date('2026-07-27T01:00:00.000Z');
    let acquisition = 0;
    let releaseSecondAcquisition: (() => void) | undefined;
    const secondAcquisition = new Promise<void>((resolve) => {
      releaseSecondAcquisition = resolve;
    });
    const tokenTwoRevocations: number[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const authorization =
          new Headers(init?.headers).get('authorization') ?? '';
        if (url.includes('/access_tokens')) {
          acquisition += 1;
          if (acquisition === 2) await secondAcquisition;
          return Response.json({
            token: `token-${acquisition}`,
            expires_at: '2026-07-27T01:03:00.000Z',
          });
        }
        if (url.endsWith('/installation/token')) {
          if (authorization === 'Bearer token-2') {
            tokenTwoRevocations.push(tokenTwoRevocations.length + 1);
            if (tokenTwoRevocations.length === 1) {
              return Response.json({ message: 'Unavailable' }, { status: 503 });
            }
          }
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/repos/org/repo')) {
          return Response.json({
            name: 'repo',
            full_name: 'org/repo',
            owner: { login: 'org' },
          });
        }
        throw new Error(`Unexpected ${url}`);
      },
    );
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => now,
      fetch,
    });
    const context = await auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo',
    });
    now = new Date('2026-07-27T01:02:30.000Z');
    const refresh = context.forge.getRepository();
    await vi.waitFor(() => expect(acquisition).toBe(2));
    await context.revoke();
    releaseSecondAcquisition?.();

    await expect(refresh).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      retryable: true,
    });
    await context.revoke();
    expect(tokenTwoRevocations).toHaveLength(2);
  });

  it('never reuses repository authorization from a prior token generation', async () => {
    let now = new Date('2026-07-27T01:00:00.000Z');
    let acquisition = 0;
    let releaseOldScope: (() => void) | undefined;
    const oldScopeGate = new Promise<void>((resolve) => {
      releaseOldScope = resolve;
    });
    let oldScopeStarted = false;
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const authorization =
          new Headers(init?.headers).get('authorization') ?? '';
        if (url.includes('/access_tokens')) {
          acquisition += 1;
          return Response.json({
            token: `token-${acquisition}`,
            expires_at:
              acquisition === 1
                ? '2026-07-27T01:02:00.000Z'
                : '2026-07-27T02:00:00.000Z',
          });
        }
        if (url.endsWith('/repos/org/repo-a')) {
          return Response.json({
            name: 'repo-a',
            full_name: 'org/repo-a',
            owner: { login: 'org' },
          });
        }
        if (url.endsWith('/repos/org/repo-b')) {
          if (authorization === 'Bearer token-1') {
            oldScopeStarted = true;
            await oldScopeGate;
            return Response.json({
              name: 'repo-b',
              full_name: 'org/repo-b',
              owner: { login: 'org' },
            });
          }
          return Response.json({ message: 'Not Found' }, { status: 404 });
        }
        throw new Error(`Unexpected ${url}`);
      },
    );
    const auth = new GitHubAppAuth({
      appId: 42,
      privateKey: privateKeyPem,
      now: () => now,
      fetch,
    });
    await auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo-a',
    });
    const oldTokenScope = auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo-b',
    });
    await vi.waitFor(() => expect(oldScopeStarted).toBe(true));
    now = new Date('2026-07-27T01:01:30.000Z');
    const newTokenScope = auth.createInstallationContext({
      installationId: 1,
      owner: 'org',
      repo: 'repo-b',
    });

    await expect(newTokenScope).rejects.toMatchObject({
      code: 'AUTHORITY_MISMATCH',
    });
    releaseOldScope?.();
    await expect(oldTokenScope).resolves.toMatchObject({
      repository: { fullName: 'org/repo-b' },
    });
  });
});
