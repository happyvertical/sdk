import { describe, expect, it } from 'vitest';
import {
  AuthError,
  AuthErrorCode,
  getAuth,
  getAuthAuto,
  InvalidCredentialsError,
  isAuthError,
  NotImplementedError,
} from './index.js';

describe('@happyvertical/auth', () => {
  describe('getAuth factory', () => {
    it('should create Keycloak provider', async () => {
      const auth = await getAuth({
        type: 'keycloak',
        serverUrl: 'https://auth.example.com',
        realm: 'test-realm',
        clientId: 'test-client',
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.oidc).toBe(true);
      expect(capabilities.decentralized).toBe(false);
    });

    it('should create Cognito provider', async () => {
      const auth = await getAuth({
        type: 'cognito',
        region: 'us-east-1',
        userPoolId: 'us-east-1_xxx',
        clientId: 'xxx',
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.oidc).toBe(true);
      expect(capabilities.decentralized).toBe(false);
    });

    it('should create Nostr provider', async () => {
      const auth = await getAuth({
        type: 'nostr',
        relays: ['wss://relay.damus.io'],
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.oidc).toBe(false);
      expect(capabilities.decentralized).toBe(true);
    });

    it('should throw for invalid provider type', async () => {
      await expect(getAuth({ type: 'invalid' } as any)).rejects.toThrow(
        'Unsupported auth provider type',
      );
    });
  });

  describe('getAuthAuto factory', () => {
    it('should auto-detect Keycloak from serverUrl and realm', async () => {
      const auth = await getAuthAuto({
        serverUrl: 'https://auth.example.com',
        realm: 'test-realm',
        clientId: 'test-client',
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.oidc).toBe(true);
    });

    it('should auto-detect Cognito from region and userPoolId', async () => {
      const auth = await getAuthAuto({
        region: 'us-east-1',
        userPoolId: 'us-east-1_xxx',
        clientId: 'xxx',
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.oidc).toBe(true);
    });

    it('should auto-detect Nostr from relays', async () => {
      const auth = await getAuthAuto({
        relays: ['wss://relay.damus.io'],
      });

      const capabilities = await auth.getCapabilities();
      expect(capabilities.decentralized).toBe(true);
    });

    it('should throw when cannot auto-detect', async () => {
      await expect(getAuthAuto({ unknownOption: 'value' })).rejects.toThrow(
        'Could not auto-detect auth provider',
      );
    });
  });

  describe('Error classes', () => {
    it('should create InvalidCredentialsError', () => {
      const error = new InvalidCredentialsError('keycloak');
      expect(error.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      expect(error.provider).toBe('keycloak');
      expect(error.message).toBe('Invalid credentials');
    });

    it('should create NotImplementedError', () => {
      const error = new NotImplementedError('deleteUser', 'nostr');
      expect(error.code).toBe(AuthErrorCode.NOT_IMPLEMENTED);
      expect(error.provider).toBe('nostr');
      expect(error.operation).toBe('deleteUser');
    });

    it('should identify AuthError with isAuthError', () => {
      const authError = new InvalidCredentialsError();
      const regularError = new Error('test');

      expect(isAuthError(authError)).toBe(true);
      expect(isAuthError(regularError)).toBe(false);
    });

    it('should serialize error to JSON', () => {
      const error = new AuthError(
        'Test error',
        AuthErrorCode.INVALID_TOKEN,
        'keycloak',
        {
          foo: 'bar',
        },
      );

      const json = error.toJSON();
      expect(json.name).toBe('AuthError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(AuthErrorCode.INVALID_TOKEN);
      expect(json.provider).toBe('keycloak');
      expect(json.context).toEqual({ foo: 'bar' });
    });
  });

  describe('Nostr provider limitations', () => {
    it('should throw NotImplementedError for unsupported operations', async () => {
      const auth = await getAuth({
        type: 'nostr',
        relays: ['wss://relay.damus.io'],
      });

      // deleteUser is not supported
      await expect(auth.deleteUser('user123', 'token')).rejects.toBeInstanceOf(
        NotImplementedError,
      );

      // requestPasswordReset is not supported
      await expect(
        auth.requestPasswordReset('test@example.com'),
      ).rejects.toBeInstanceOf(NotImplementedError);

      // refresh is not supported (NIP-98 tokens are ephemeral)
      await expect(auth.refresh('token')).rejects.toBeInstanceOf(
        NotImplementedError,
      );
    });

    it('should return null for OIDC discovery document', async () => {
      const auth = await getAuth({
        type: 'nostr',
        relays: ['wss://relay.damus.io'],
      });

      const doc = await auth.getDiscoveryDocument();
      expect(doc).toBeNull();
    });
  });
});
