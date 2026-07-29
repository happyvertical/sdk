import { createSign } from 'node:crypto';
import { ForgeError } from '../forge/errors.js';
import type {
  ForgeInstallationRef,
  ForgeRepositoryRef,
} from '../forge/types.js';
import { GitHubForgeProvider } from './forge.js';
import { GitHubTransport } from './transport.js';

/** Credentials required to sign GitHub App JSON Web Tokens. */
export interface GitHubAppCredentials {
  appId: string | number;
  privateKey: string;
}

/** Construction options for one request/job-scoped GitHub App authority. */
export interface GitHubAppAuthOptions extends GitHubAppCredentials {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Refresh before provider expiry. Defaults to 60 seconds. */
  expirySkewMs?: number;
}

/** Installation and repository boundary requested by a caller. */
export interface GitHubInstallationScope {
  installationId: string | number;
  owner: string;
  repo: string;
}

/** Authorized repository client and explicit token-revocation handle. */
export interface GitHubInstallationContext {
  installation: ForgeInstallationRef;
  repository: ForgeRepositoryRef;
  forge: GitHubForgeProvider;
  /** Revokes issued tokens remotely and closes this local context. */
  revoke(): Promise<void>;
}

interface CachedToken {
  token: string;
  expiresAt: number;
  generation: number;
  authorizedRepositories: Set<string>;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Creates a short-lived GitHub App JWT without mutating process credentials.
 * @param credentials GitHub App ID and RSA private key.
 * @param now Clock value used for issued-at and expiry claims.
 * @returns Signed RS256 GitHub App JWT.
 * @throws {ForgeError} When credentials are missing or the key cannot sign.
 */
export function createGitHubAppJwt(
  credentials: GitHubAppCredentials,
  now = new Date(),
): string {
  if (!credentials.appId || !credentials.privateKey) {
    throw new ForgeError(
      'GitHub App id and private key are required',
      'CONFIGURATION_ERROR',
      { provider: 'github' },
    );
  }
  const issuedAt = Math.floor(now.getTime() / 1_000) - 60;
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iat: issuedAt,
    exp: issuedAt + 10 * 60,
    iss: String(credentials.appId),
  });
  const unsigned = `${header}.${payload}`;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(credentials.privateKey, 'base64url')}`;
  } catch (cause) {
    throw new ForgeError(
      'GitHub App private key could not sign a JWT',
      'CONFIGURATION_ERROR',
      { cause, provider: 'github' },
    );
  }
}

/**
 * Request/job-scoped GitHub App authority.
 *
 * Keep this object inside a single request or job. Its token cache and in-flight
 * acquisitions are instance fields, so installations cannot share credentials.
 */
export class GitHubAppAuth {
  private readonly credentials: GitHubAppCredentials;
  private readonly baseUrl?: string;
  private readonly fetchImplementation?: typeof globalThis.fetch;
  private readonly now: () => Date;
  private readonly expirySkewMs: number;
  private readonly tokens = new Map<string, CachedToken>();
  private readonly issuedTokens = new Map<string, Map<string, number>>();
  private readonly tokenRequests = new Map<string, Promise<CachedToken>>();
  private readonly authorizationRequests = new Map<string, Promise<void>>();
  private readonly revokedInstallations = new Set<string>();
  private nextTokenGeneration = 1;

  /**
   * Creates isolated GitHub App authority from credentials and dependencies.
   * @param options Credentials, clock, provider URL, and fetch override.
   */
  constructor(options: GitHubAppAuthOptions) {
    this.credentials = {
      appId: options.appId,
      privateKey: options.privateKey,
    };
    this.baseUrl = options.baseUrl;
    this.fetchImplementation = options.fetch;
    this.now = options.now ?? (() => new Date());
    this.expirySkewMs = options.expirySkewMs ?? 60_000;
  }

  /**
   * Clears locally cached credentials without remote revocation.
   * @param installationId Optional installation to clear; omitted clears all.
   * @returns Nothing.
   */
  clear(installationId?: string | number): void {
    if (installationId === undefined) {
      this.tokens.clear();
      this.issuedTokens.clear();
      this.tokenRequests.clear();
      this.authorizationRequests.clear();
      this.revokedInstallations.clear();
      return;
    }
    const id = String(installationId);
    this.clearCachedInstallation(id);
    this.revokedInstallations.delete(id);
  }

  /**
   * Acquires and verifies one installation/repository boundary.
   * @param scope Installation ID and exact repository coordinates.
   * @returns An isolated forge provider and revocation handle.
   * @throws {ForgeError} When authentication, provider access, or scope fails.
   */
  async createInstallationContext(
    scope: GitHubInstallationScope,
  ): Promise<GitHubInstallationContext> {
    const installationId = String(scope.installationId);
    const fullName = `${scope.owner}/${scope.repo}`.toLowerCase();
    await this.getAuthorizedToken(installationId, fullName);
    let active = true;
    let revocationInFlight: Promise<void> | undefined;
    const token = () => {
      if (!active) {
        throw new ForgeError(
          'GitHub installation context has been revoked',
          'AUTHENTICATION_FAILED',
          { provider: 'github' },
        );
      }
      return this.getAuthorizedToken(installationId, fullName);
    };
    const forge = new GitHubForgeProvider({
      owner: scope.owner,
      repo: scope.repo,
      transport: new GitHubTransport({
        token,
        baseUrl: this.baseUrl,
        fetch: this.fetchImplementation,
      }),
    });
    return {
      installation: { id: installationId },
      repository: {
        owner: scope.owner,
        name: scope.repo,
        fullName: `${scope.owner}/${scope.repo}`,
      },
      forge,
      revoke: async () => {
        active = false;
        if (!revocationInFlight) {
          revocationInFlight = this.revokeInstallationTokens(
            installationId,
          ).finally(() => {
            revocationInFlight = undefined;
          });
        }
        await revocationInFlight;
      },
    };
  }

  private async getAuthorizedToken(
    installationId: string,
    fullName: string,
  ): Promise<string> {
    if (this.revokedInstallations.has(installationId)) {
      throw new ForgeError(
        'GitHub App installation authority has been revoked',
        'AUTHENTICATION_FAILED',
        { provider: 'github' },
      );
    }
    const cached = await this.getInstallationToken(installationId);
    if (this.revokedInstallations.has(installationId)) {
      throw new ForgeError(
        'GitHub App installation authority has been revoked',
        'AUTHENTICATION_FAILED',
        { provider: 'github' },
      );
    }
    if (cached.authorizedRepositories.has(fullName)) return cached.token;

    const key = `${installationId}:${cached.generation}:${fullName}`;
    let pending = this.authorizationRequests.get(key);
    if (!pending) {
      pending = this.verifyRepositoryScope(cached, fullName).finally(() => {
        this.authorizationRequests.delete(key);
      });
      this.authorizationRequests.set(key, pending);
    }
    await pending;
    if (this.revokedInstallations.has(installationId)) {
      throw new ForgeError(
        'GitHub App installation authority has been revoked',
        'AUTHENTICATION_FAILED',
        { provider: 'github' },
      );
    }
    return cached.token;
  }

  private async getInstallationToken(
    installationId: string,
  ): Promise<CachedToken> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt - this.expirySkewMs > this.now().getTime()) {
      return cached;
    }

    let pending = this.tokenRequests.get(installationId);
    if (!pending) {
      pending = this.acquireInstallationToken(installationId).finally(() => {
        this.tokenRequests.delete(installationId);
      });
      this.tokenRequests.set(installationId, pending);
    }
    return pending;
  }

  private async acquireInstallationToken(
    installationId: string,
  ): Promise<CachedToken> {
    const appTransport = new GitHubTransport({
      token: () => createGitHubAppJwt(this.credentials, this.now()),
      baseUrl: this.baseUrl,
      fetch: this.fetchImplementation,
    });
    const response = await appTransport.request<{
      token?: string;
      expires_at?: string;
    }>({
      method: 'POST',
      path: `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    });
    const token = response.data.token;
    const expiresAt = Date.parse(response.data.expires_at ?? '');
    if (!token || !Number.isFinite(expiresAt)) {
      throw new ForgeError(
        'GitHub returned an invalid installation token',
        'AUTHENTICATION_FAILED',
        { provider: 'github', requestId: response.metadata.requestId },
      );
    }
    const cached: CachedToken = {
      token,
      expiresAt,
      generation: this.nextTokenGeneration,
      authorizedRepositories: new Set(),
    };
    this.nextTokenGeneration += 1;
    const issued = this.issuedTokens.get(installationId) ?? new Map();
    for (const [issuedToken, issuedExpiry] of issued) {
      if (issuedExpiry <= this.now().getTime()) issued.delete(issuedToken);
    }
    issued.set(token, expiresAt);
    this.issuedTokens.set(installationId, issued);
    if (this.revokedInstallations.has(installationId)) {
      try {
        await this.revokeToken(token);
        issued.delete(token);
      } catch (cause) {
        const providerError = cause instanceof ForgeError ? cause : undefined;
        throw new ForgeError(
          'A GitHub token acquired during revocation could not be revoked',
          'PROVIDER_ERROR',
          {
            cause,
            provider: 'github',
            status: providerError?.status,
            requestId: providerError?.requestId,
            rateLimit: providerError?.rateLimit,
            retryable: providerError?.retryable,
          },
        );
      }
      throw new ForgeError(
        'GitHub App installation authority was revoked during token acquisition',
        'AUTHENTICATION_FAILED',
        { provider: 'github' },
      );
    }
    this.tokens.set(installationId, cached);
    return cached;
  }

  private async verifyRepositoryScope(
    cached: CachedToken,
    fullName: string,
  ): Promise<void> {
    const transport = new GitHubTransport({
      token: cached.token,
      baseUrl: this.baseUrl,
      fetch: this.fetchImplementation,
    });
    const separator = fullName.indexOf('/');
    const owner = fullName.slice(0, separator);
    const repo = fullName.slice(separator + 1);
    try {
      await transport.request({
        method: 'GET',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      });
    } catch (cause) {
      const providerError = cause instanceof ForgeError ? cause : undefined;
      if (
        providerError?.retryable ||
        providerError?.code === 'AUTHENTICATION_FAILED' ||
        providerError?.code === 'TRANSPORT_ERROR' ||
        (providerError?.status !== 403 && providerError?.status !== 404)
      ) {
        throw cause;
      }
      throw new ForgeError(
        `GitHub App installation is not authorized for ${fullName}`,
        'AUTHORITY_MISMATCH',
        {
          cause,
          provider: 'github',
          status: providerError?.status,
          requestId: providerError?.requestId,
          rateLimit: providerError?.rateLimit,
        },
      );
    }
    cached.authorizedRepositories.add(fullName);
  }

  private async revokeInstallationTokens(
    installationId: string,
  ): Promise<void> {
    this.revokedInstallations.add(installationId);
    const issued = [...(this.issuedTokens.get(installationId)?.keys() ?? [])];
    this.clearCachedInstallation(installationId, false);
    if (issued.length === 0) return;

    const retained = this.issuedTokens.get(installationId) ?? new Map();
    const failures: unknown[] = [];
    for (const token of issued) {
      try {
        await this.revokeToken(token);
        retained.delete(token);
      } catch (error) {
        failures.push(error);
      }
    }
    if (retained.size === 0) this.issuedTokens.delete(installationId);
    else this.issuedTokens.set(installationId, retained);
    if (failures.length > 0) {
      const failure = failures[0];
      const providerError = failure instanceof ForgeError ? failure : undefined;
      throw new ForgeError(
        'One or more GitHub installation tokens could not be revoked',
        'PROVIDER_ERROR',
        {
          cause: failure,
          provider: 'github',
          status: providerError?.status,
          requestId: providerError?.requestId,
          rateLimit: providerError?.rateLimit,
          retryable: providerError?.retryable,
        },
      );
    }
  }

  private async revokeToken(token: string): Promise<void> {
    const transport = new GitHubTransport({
      token,
      baseUrl: this.baseUrl,
      fetch: this.fetchImplementation,
    });
    await transport.request<void>({
      method: 'DELETE',
      path: '/installation/token',
    });
  }

  private clearCachedInstallation(
    installationId: string,
    clearIssued = true,
  ): void {
    this.tokens.delete(installationId);
    if (clearIssued) this.issuedTokens.delete(installationId);
    this.tokenRequests.delete(installationId);
    for (const key of this.authorizationRequests.keys()) {
      if (key.startsWith(`${installationId}:`)) {
        this.authorizationRequests.delete(key);
      }
    }
  }
}
