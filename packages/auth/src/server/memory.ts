import type {
  OAuthAuthorizationCodeGrant,
  OAuthAuthorizationStorage,
  OAuthClient,
  OAuthCodeConsumeResult,
  OAuthRefreshGrant,
  OAuthRefreshRotateResult,
} from './types.js';

/** Test-only reference store. Production callers must provide durable transactional persistence. */
export class InMemoryOAuthAuthorizationStorage
  implements OAuthAuthorizationStorage
{
  readonly clients = new Map<string, OAuthClient>();
  readonly codes = new Map<string, OAuthAuthorizationCodeGrant>();
  readonly refreshes = new Map<string, OAuthRefreshGrant>();
  readonly usedCodes = new Set<string>();
  readonly usedRefreshes = new Set<string>();
  readonly revokedFamilies = new Set<string>();
  readonly revokedAccess = new Map<string, Date>();

  async getClient(clientId: string) {
    return this.clients.get(clientId) ?? null;
  }
  async registerClient(client: OAuthClient) {
    this.clients.set(client.id, client);
  }
  async createAuthorizationCode(grant: OAuthAuthorizationCodeGrant) {
    this.codes.set(grant.id, grant);
  }
  async consumeAuthorizationCode(
    input: Parameters<OAuthAuthorizationStorage['consumeAuthorizationCode']>[0],
  ): Promise<OAuthCodeConsumeResult> {
    const grant = this.codes.get(input.id);
    if (!grant || grant.codeHash !== input.codeHash)
      return { status: 'invalid' };
    if (this.usedCodes.has(grant.id)) return { status: 'replayed' };
    if (grant.expiresAt <= input.now) return { status: 'expired' };
    if (
      grant.clientId !== input.clientId ||
      grant.redirectUri !== input.redirectUri ||
      grant.resource !== input.resource
    )
      return { status: 'invalid' };
    this.usedCodes.add(grant.id);
    return { status: 'consumed', grant };
  }
  async createRefreshGrant(grant: OAuthRefreshGrant) {
    this.refreshes.set(grant.id, grant);
  }
  async rotateRefreshGrant(
    input: Parameters<OAuthAuthorizationStorage['rotateRefreshGrant']>[0],
  ): Promise<OAuthRefreshRotateResult> {
    const grant = this.refreshes.get(input.id);
    if (!grant || grant.tokenHash !== input.tokenHash)
      return { status: 'invalid' };
    if (this.revokedFamilies.has(grant.familyId)) return { status: 'revoked' };
    if (this.usedRefreshes.has(grant.id)) {
      this.revokedFamilies.add(grant.familyId);
      return { status: 'replayed' };
    }
    if (grant.expiresAt <= input.now) return { status: 'expired' };
    if (grant.clientId !== input.clientId || grant.resource !== input.resource)
      return { status: 'invalid' };
    this.usedRefreshes.add(grant.id);
    this.refreshes.set(input.replacement.id, {
      ...grant,
      ...input.replacement,
    });
    return { status: 'rotated', grant };
  }
  async revokeRefreshGrant(input: {
    readonly id: string;
    readonly tokenHash: string;
    readonly now: Date;
  }) {
    const grant = this.refreshes.get(input.id);
    if (grant?.tokenHash === input.tokenHash)
      this.revokedFamilies.add(grant.familyId);
  }
  async revokeAccessToken(input: {
    readonly jti: string;
    readonly expiresAt: Date;
  }) {
    this.revokedAccess.set(input.jti, input.expiresAt);
  }
  async isAccessTokenRevoked(jti: string, now: Date) {
    const expiry = this.revokedAccess.get(jti);
    return Boolean(expiry && expiry > now);
  }
}
