import { describe, expect, it } from 'vitest';

import { XAdapter, YouTubeAdapter } from './index.js';

const runLiveSmoke =
  process.env.HV_SOCIAL_LIVE_SMOKE === '1' ||
  process.env.SOCIAL_LIVE_SMOKE === '1';

const describeLive = runLiveSmoke ? describe : describe.skip;

function requiredEnv(names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing live social smoke test env: ${missing.join(', ')}`,
    );
  }

  return values;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

describeLive('live social credential smoke tests', () => {
  it('validates X OAuth 1.0a credentials with a read-only users/me request', async () => {
    const env = requiredEnv([
      'BLINDMANPRESS_X_CONSUMER_KEY',
      'BLINDMANPRESS_X_SECRET_KEY',
      'BLINDMANPRESS_ACCESS_TOKEN',
      'BLINDMANPRESS_ACCESS_TOKEN_SECRET',
    ]);

    const adapter = new XAdapter({
      type: 'x',
      apiKey: env.BLINDMANPRESS_X_CONSUMER_KEY,
      apiSecret: env.BLINDMANPRESS_X_SECRET_KEY,
      accessToken: env.BLINDMANPRESS_ACCESS_TOKEN,
      accessSecret: env.BLINDMANPRESS_ACCESS_TOKEN_SECRET,
      publishMode: 'dry_run',
    });

    await expect(adapter.authenticate()).resolves.toMatchObject({
      accessToken: env.BLINDMANPRESS_ACCESS_TOKEN,
    });
  });

  it('builds a YouTube Shorts OAuth consent URL without a network write', () => {
    const env = requiredEnv(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
    const redirectUri =
      process.env.YOUTUBE_REDIRECT_URI ??
      'https://mac.tail8e7e73.ts.net/network/settings/social/callback/youtube';
    const codeVerifier =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
    const adapter = new YouTubeAdapter({
      type: 'youtube',
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri,
      publishMode: 'dry_run',
    });

    const auth = adapter.getAuthorizationUrl({
      codeVerifier,
      redirectUri,
      state: 'live-smoke-state',
    });
    const parsed = new URL(auth.url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(parsed.searchParams.get('client_id')).toBe(env.YOUTUBE_CLIENT_ID);
    expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('state')).toBe('live-smoke-state');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining([
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
      ]),
    );
    expect(auth.codeVerifier).toBe(codeVerifier);
  });

  it('checks the YouTube OAuth client secret at the token endpoint without a real auth code', async () => {
    const env = requiredEnv(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']);
    const redirectUri =
      process.env.YOUTUBE_REDIRECT_URI ??
      'https://mac.tail8e7e73.ts.net/network/settings/social/callback/youtube';

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.YOUTUBE_CLIENT_ID,
        client_secret: env.YOUTUBE_CLIENT_SECRET,
        code: 'codex-live-smoke-invalid-code',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).not.toBe('invalid_client');
  });

  it.skipIf(!process.env.YOUTUBE_REFRESH_TOKEN)(
    'refreshes YouTube credentials and reads channel metadata when a refresh token is available',
    async () => {
      const env = requiredEnv([
        'YOUTUBE_CLIENT_ID',
        'YOUTUBE_CLIENT_SECRET',
        'YOUTUBE_REFRESH_TOKEN',
      ]);
      const refreshToken = env.YOUTUBE_REFRESH_TOKEN;

      const adapter = new YouTubeAdapter({
        type: 'youtube',
        clientId: env.YOUTUBE_CLIENT_ID,
        clientSecret: env.YOUTUBE_CLIENT_SECRET,
        refreshToken,
        publishMode: 'dry_run',
      });

      const auth = await adapter.refreshToken(refreshToken);
      expect(auth.accessToken).toBeTruthy();

      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        },
      );
      const body = await readJson(response);

      expect(response.ok, JSON.stringify(body)).toBe(true);
      expect(Array.isArray(body.items)).toBe(true);
    },
  );
});
