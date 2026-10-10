/** Node-only local Sign in with ChatGPT session runtime. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTHORIZE = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN = 'https://auth.openai.com/api/accounts/oauth/token';
const DISCOVERY = 'https://auth.openai.com/.well-known/openid-configuration';
const RESOURCE = 'https://api.openai.com/v1';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'resource.invoke',
  PLAN_SCOPE,
];

export class ChatGPTSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChatGPTSessionError';
  }
}
export interface ChatGPTSession {
  subject: string;
  email?: string;
  clientId: string;
  hostId: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: number;
}
export interface LocalChatGPTOptions {
  appName: string;
  path?: string;
  openBrowser?: (url: string) => Promise<void> | void;
  fetch?: typeof fetch;
  now?: () => number;
}
interface Disk {
  hostId: string;
  sessions: ChatGPTSession[];
}
interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  selected?: ChatGPTSession;
  server: ReturnType<typeof createServer>;
}

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url');
}
function random() {
  return b64(randomBytes(32));
}
function pathFor(options: LocalChatGPTOptions) {
  return (
    options.path ??
    join(
      process.env.XDG_CONFIG_HOME ??
        join(process.env.HOME ?? tmpdir(), '.config'),
      options.appName,
      'chatgpt.json',
    )
  );
}
function required(value: string | null, label: string) {
  if (!value)
    throw new ChatGPTSessionError(
      'invalid_callback',
      `Missing ${label} in OAuth callback`,
    );
  return value;
}

/**
 * Stores credentials only in an owner-readable local file.  Callers should pass
 * a per-application config path; no credential is ever written to a project.
 */
export class LocalChatGPTSessionManager {
  private pending = new Map<string, Pending>();
  private refreshing = new Map<string, Promise<ChatGPTSession>>();
  private readonly file: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  constructor(private readonly options: LocalChatGPTOptions) {
    this.file = pathFor(options);
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }
  private async disk(): Promise<Disk> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as Disk;
    } catch (e: any) {
      if (e?.code === 'ENOENT')
        return { hostId: `urn:uuid:${randomUUID()}`, sessions: [] };
      throw e;
    }
  }
  private async save(disk: Disk) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(disk), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, this.file);
    await chmod(this.file, 0o600);
  }
  async sessions(): Promise<
    Array<Omit<ChatGPTSession, 'accessToken' | 'refreshToken' | 'idToken'>>
  > {
    return (await this.disk()).sessions.map(
      ({ accessToken, refreshToken, idToken, ...safe }) => safe,
    );
  }
  async begin(
    selectedClientId?: string,
  ): Promise<{ authorizationUrl: string; callback: Promise<ChatGPTSession> }> {
    const disk = await this.disk();
    const selected = selectedClientId
      ? disk.sessions.find((s) => s.clientId === selectedClientId)
      : undefined;
    if (selectedClientId && !selected)
      throw new ChatGPTSessionError(
        'unknown_account',
        'Selected ChatGPT account is not stored locally',
      );
    const state = random(),
      nonce = random(),
      verifier = random();
    const challenge = b64(createHash('sha256').update(verifier).digest());
    let resolve!: (value: ChatGPTSession) => void,
      reject!: (reason: Error) => void;
    const callback = new Promise<ChatGPTSession>((a, b) => {
      resolve = a;
      reject = b;
    });
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const finish = async () => {
        try {
          const result = await this.complete(url, state);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Sign-in complete. You may close this window.');
          resolve(result);
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Sign-in failed. Return to the application.');
          reject(error as Error);
        } finally {
          server.close();
          this.pending.delete(state);
        }
      };
      void finish();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new ChatGPTSessionError(
        'loopback_unavailable',
        'Could not bind 127.0.0.1 loopback callback',
      );
    const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
    const clientId = selected?.clientId ?? 'dynamic_agent_client';
    this.pending.set(state, {
      state,
      nonce,
      verifier,
      redirectUri,
      clientId,
      selected,
      server,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      ext_agent_host_id: disk.hostId,
    });
    if (selected) {
      params.set('id_token_hint', selected.idToken);
      if (selected.email) params.set('login_hint', selected.email);
    } else params.set('agent_name_hint', this.options.appName);
    const authorizationUrl = `${AUTHORIZE}?${params}`;
    await this.options.openBrowser?.(authorizationUrl);
    return { authorizationUrl, callback };
  }
  private async complete(
    url: URL,
    expectedState: string,
  ): Promise<ChatGPTSession> {
    const pending = this.pending.get(expectedState);
    if (!pending || url.searchParams.get('state') !== expectedState)
      throw new ChatGPTSessionError(
        'state_mismatch',
        'Rejected OAuth callback with unbound state',
      );
    if (url.searchParams.get('error'))
      throw new ChatGPTSessionError(
        'consent_declined',
        'ChatGPT authorization was declined',
      );
    const code = required(url.searchParams.get('code'), 'code');
    const callbackClientId = url.searchParams.get('client_id');
    const clientId = pending.selected
      ? pending.clientId
      : required(callbackClientId, 'issued client_id');
    if (!pending.selected && clientId === 'dynamic_agent_client')
      throw new ChatGPTSessionError(
        'registration_incomplete',
        'OAuth registration did not return an issued client id',
      );
    if (pending.selected && callbackClientId && callbackClientId !== clientId)
      throw new ChatGPTSessionError(
        'client_mismatch',
        'OAuth callback changed the registered client',
      );
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri,
      resource: RESOURCE,
    });
    const response = await this.fetcher(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok)
      throw new ChatGPTSessionError(
        'token_exchange_failed',
        'OAuth token exchange failed',
      );
    const token: any = await response.json();
    const identity = await this.verify(token.id_token, clientId, pending.nonce);
    const scopes = String(token.scope ?? '')
      .split(' ')
      .filter(Boolean);
    if (!scopes.includes(PLAN_SCOPE))
      throw new ChatGPTSessionError(
        'plan_permission_missing',
        'ChatGPT plan usage permission was not granted',
      );
    const session: ChatGPTSession = {
      subject: identity.sub,
      email: identity.email,
      clientId,
      hostId: (await this.disk()).hostId,
      idToken: token.id_token,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scopes,
      expiresAt: this.now() + Number(token.expires_in ?? 0) * 1000,
    };
    if (!session.accessToken || !session.refreshToken)
      throw new ChatGPTSessionError(
        'invalid_token_response',
        'OAuth response omitted renewable credentials',
      );
    if (pending.selected && session.subject !== pending.selected.subject)
      throw new ChatGPTSessionError(
        'account_mismatch',
        'OAuth identity did not match the selected account',
      );
    const disk = await this.disk();
    disk.sessions = [
      ...disk.sessions.filter((s) => s.clientId !== clientId),
      session,
    ];
    await this.save(disk);
    return session;
  }
  private async verify(
    token: string,
    clientId: string,
    nonce: string,
  ): Promise<{ sub: string; email?: string }> {
    if (!token)
      throw new ChatGPTSessionError(
        'invalid_token_response',
        'OAuth response omitted id_token',
      );
    const config = (await (await this.fetcher(DISCOVERY)).json()) as {
      jwks_uri?: string;
    };
    if (!config.jwks_uri)
      throw new ChatGPTSessionError(
        'discovery_failed',
        'OpenID discovery did not supply JWKS',
      );
    const result = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(config.jwks_uri)),
      { issuer: 'https://auth.openai.com', audience: clientId },
    );
    if (
      result.payload.nonce !== nonce ||
      typeof result.payload.sub !== 'string'
    )
      throw new ChatGPTSessionError(
        'invalid_identity',
        'OIDC token nonce or subject is invalid',
      );
    return {
      sub: result.payload.sub,
      email:
        typeof result.payload.email === 'string'
          ? result.payload.email
          : undefined,
    };
  }
  /** Return a currently usable token, serializing rotating-token refreshes per registration. */
  async accessToken(clientId: string): Promise<string> {
    const session = (await this.disk()).sessions.find(
      (s) => s.clientId === clientId,
    );
    if (!session)
      throw new ChatGPTSessionError(
        'unknown_account',
        'Selected ChatGPT account is not stored locally',
      );
    if (session.expiresAt > this.now() + 60_000) return session.accessToken;
    return (await this.refresh(clientId)).accessToken;
  }
  async refresh(clientId: string): Promise<ChatGPTSession> {
    const active = this.refreshing.get(clientId);
    if (active) return active;
    const refresh = this.doRefresh(clientId).finally(() =>
      this.refreshing.delete(clientId),
    );
    this.refreshing.set(clientId, refresh);
    return refresh;
  }
  private async doRefresh(clientId: string): Promise<ChatGPTSession> {
    const disk = await this.disk();
    const current = disk.sessions.find((s) => s.clientId === clientId);
    if (!current)
      throw new ChatGPTSessionError(
        'unknown_account',
        'Selected ChatGPT account is not stored locally',
      );
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: current.clientId,
      refresh_token: current.refreshToken,
      resource: RESOURCE,
    });
    const response = await this.fetcher(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        disk.sessions = disk.sessions.filter((s) => s.clientId !== clientId);
        await this.save(disk);
        throw new ChatGPTSessionError(
          'refresh_invalid',
          'Saved ChatGPT session is no longer renewable; sign in again',
        );
      }
      throw new ChatGPTSessionError(
        'refresh_failed',
        'ChatGPT session refresh failed; credentials were retained',
      );
    }
    const token: any = await response.json();
    if (!token.access_token || !token.refresh_token)
      throw new ChatGPTSessionError(
        'invalid_refresh_response',
        'Refresh response omitted replacement credentials',
      );
    const updated: ChatGPTSession = {
      ...current,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      idToken: token.id_token ?? current.idToken,
      scopes: String(token.scope ?? current.scopes.join(' '))
        .split(' ')
        .filter(Boolean),
      expiresAt: this.now() + Number(token.expires_in ?? 0) * 1000,
    };
    disk.sessions = disk.sessions.map((s) =>
      s.clientId === clientId ? updated : s,
    );
    await this.save(disk);
    return updated;
  }
  /** Clear local credentials after attempting remote refresh-token revocation. */
  async logout(
    clientId: string,
  ): Promise<{ remoteRevocationConfirmed: boolean }> {
    const disk = await this.disk();
    const current = disk.sessions.find((s) => s.clientId === clientId);
    if (!current) return { remoteRevocationConfirmed: true };
    let confirmed = false;
    try {
      const discovery = (await (await this.fetcher(DISCOVERY)).json()) as {
        revocation_endpoint?: string;
      };
      if (!discovery.revocation_endpoint) throw new Error('missing endpoint');
      const body = new URLSearchParams({
        token: current.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: current.clientId,
      });
      const response = await this.fetcher(discovery.revocation_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      confirmed = response.ok;
    } finally {
      disk.sessions = disk.sessions.filter((s) => s.clientId !== clientId);
      await this.save(disk);
    }
    return { remoteRevocationConfirmed: confirmed };
  }
}
