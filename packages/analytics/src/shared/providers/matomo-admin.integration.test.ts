/**
 * Integration tests for the Matomo admin client against a live Matomo install.
 *
 * Skipped unless these env vars are set:
 *   MATOMO_BASE_URL=https://your-matomo
 *   MATOMO_TOKEN_AUTH=<super-user `token_auth` from Profile → Security → Auth Tokens>
 *
 * Also honours `MATOMO_INTEGRATION=1` as an explicit opt-in toggle.
 *
 * The tests provision and tear down a uniquely-named site + user on every run,
 * so a successful test leaves no residue. A failed test may leave a partially-
 * provisioned site or user — they're labelled `analytics-admin-test-<timestamp>`
 * for easy manual cleanup.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { MatomoAdmin } from './matomo-admin';

const baseUrl = process.env.MATOMO_BASE_URL;
const tokenAuth = process.env.MATOMO_TOKEN_AUTH;
const optedIn =
  process.env.MATOMO_INTEGRATION === '1' || (!!baseUrl && !!tokenAuth);

const describeIf = optedIn && baseUrl && tokenAuth ? describe : describe.skip;

describeIf('MatomoAdmin (integration)', () => {
  // Construction is deferred so describe.skip doesn't trip the env-var guards
  // when we're not opted in. (Vitest still evaluates the describe callback to
  // register tests, even when skipped.)
  let admin: MatomoAdmin;
  const ensureAdmin = (): MatomoAdmin => {
    if (!admin) {
      admin = new MatomoAdmin({
        baseUrl: baseUrl as string,
        tokenAuth: tokenAuth as string,
        timeout: 15_000,
      });
    }
    return admin;
  };

  const stamp = Date.now();
  const siteName = `analytics-admin-test-${stamp}`;
  const siteUrl = `https://test-${stamp}.example.invalid`;
  const userLogin = `analytics-admin-test-${stamp}`;
  const userEmail = `analytics-admin-test-${stamp}@example.invalid`;
  // Matomo enforces complexity on user passwords; this satisfies length + variety.
  const userPassword = `T3st-pass-${stamp}!`;

  let createdSiteId: string | undefined;
  let createdUserLogin: string | undefined;

  it('health() returns ok with a version', async () => {
    const result = await ensureAdmin().health();
    expect(result.ok).toBe(true);
    expect(typeof result.version).toBe('string');
    expect(result.version?.length).toBeGreaterThan(0);
  });

  it('createSite → getSite roundtrip surfaces the new site', async () => {
    const created = await ensureAdmin().createSite({
      name: siteName,
      urls: [siteUrl],
      timezone: 'America/Edmonton',
      currency: 'CAD',
      tenantId: 'integration-test',
    });
    createdSiteId = created.id;

    expect(created.id).toMatch(/^\d+$/);
    expect(created.name).toBe(siteName);
    expect(created.url).toBe(siteUrl);
    expect(created.tenantId).toBe('integration-test');
    expect(created.timezone).toBe('America/Edmonton');
    expect(created.currency).toBe('CAD');

    const fetched = await ensureAdmin().getSite(created.id);
    expect(fetched?.name).toBe(siteName);
  });

  it('listSites includes the newly created site', async () => {
    if (!createdSiteId) throw new Error('site was not created');
    const sites = await ensureAdmin().listSites();
    const ours = sites.find((s) => s.id === createdSiteId);
    expect(ours?.name).toBe(siteName);
  });

  it('createUser → getUser roundtrip', async () => {
    const created = await ensureAdmin().createUser({
      login: userLogin,
      email: userEmail,
      password: userPassword,
      tenantId: 'integration-test',
    });
    createdUserLogin = created.login;
    expect(created.login).toBe(userLogin);
    expect(created.email).toBe(userEmail);

    const fetched = await ensureAdmin().getUser(userLogin);
    expect(fetched?.email).toBe(userEmail);
  });

  it('setUserAccess + mintUserToken + the minted token can authenticate', async () => {
    if (!createdSiteId || !createdUserLogin) {
      throw new Error('site or user was not created');
    }
    await ensureAdmin().setUserAccess({
      login: createdUserLogin,
      access: 'view',
      siteIds: [createdSiteId],
    });
    const accessCheck = await ensureAdmin().verifyUserSiteAccess({
      login: createdUserLogin,
      siteId: createdSiteId,
    });
    expect(accessCheck.ok).toBe(true);
    expect(accessCheck.access).toBe('view');

    const minted = await ensureAdmin().mintUserToken({
      login: createdUserLogin,
      description: `integration-test-${stamp}`,
      // Matomo confirms the *target* user's password — we know it because
      // we just provisioned the user above with `userPassword`.
      passwordConfirmation: userPassword,
    });
    expect(minted.token.length).toBeGreaterThan(16);
    expect(minted.login).toBe(createdUserLogin);

    // The minted token is scoped to the new user's permissions: view on the
    // new site only. A health() call should succeed against it.
    const scoped = new MatomoAdmin({
      baseUrl: baseUrl as string,
      tokenAuth: minted.token,
      timeout: 15_000,
    });
    const health = await scoped.health();
    expect(health.ok).toBe(true);

    const tokenCheck = await ensureAdmin().verifyTokenSiteAccess({
      tokenAuth: minted.token,
      siteId: createdSiteId,
    });
    expect(tokenCheck.ok).toBe(true);
  });

  // Cleanup runs as afterAll(best-effort) rather than a test case so that:
  //   - it still runs when an earlier test fails or the runner bails early
  //   - it doesn't fail the suite if cleanup itself fails (we'd rather see
  //     the original test failure than a teardown error mask it)
  // The unique-per-run naming (`analytics-admin-test-<timestamp>`) makes any
  // residue easy to find and clear manually.
  afterAll(async () => {
    if (createdUserLogin) {
      try {
        await ensureAdmin().deleteUser(createdUserLogin);
      } catch (error) {
        console.warn(
          `[matomo-integration] cleanup: failed to delete user ${createdUserLogin}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    if (createdSiteId) {
      try {
        await ensureAdmin().deleteSite(createdSiteId);
      } catch (error) {
        console.warn(
          `[matomo-integration] cleanup: failed to delete site ${createdSiteId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  });
});
