/**
 * Kanidm Integration Tests
 *
 * These tests require a running Kanidm instance with proper configuration.
 *
 * Environment variables required:
 * - KANIDM_SERVER_URL: e.g., https://idp.blindmanpress.com
 * - KANIDM_CLIENT_ID: e.g., dex
 * - KANIDM_CLIENT_SECRET: (if using confidential client)
 * - KANIDM_ADMIN_USERNAME: e.g., idm_admin
 * - KANIDM_ADMIN_PASSWORD: Admin password for API access
 *
 * Optional:
 * - KANIDM_REDIRECT_URI: OAuth callback URL
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAuth } from './index.js';
import { isAuthError, NotImplementedError } from './shared/errors.js';
import type { AuthInterface, UserProfile } from './shared/types.js';

// Skip tests if environment variables are not set
const SKIP_INTEGRATION =
  !process.env.KANIDM_SERVER_URL || !process.env.KANIDM_CLIENT_ID;

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration('Kanidm Integration Tests', () => {
  let auth: AuthInterface;
  let createdUserId: string | undefined;

  const config = {
    serverUrl: process.env.KANIDM_SERVER_URL!,
    clientId: process.env.KANIDM_CLIENT_ID!,
    clientSecret: process.env.KANIDM_CLIENT_SECRET,
    redirectUri:
      process.env.KANIDM_REDIRECT_URI ||
      'https://auth.happyvertical.com/callback',
    adminUsername: process.env.KANIDM_ADMIN_USERNAME || 'idm_admin',
    adminPassword: process.env.KANIDM_ADMIN_PASSWORD,
  };

  beforeAll(async () => {
    // Create auth client
    auth = await getAuth({
      type: 'kanidm',
      serverUrl: config.serverUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      adminUsername: config.adminUsername,
      adminPassword: config.adminPassword,
    });
  });

  afterAll(async () => {
    // Clean up: delete any users created during tests
    if (createdUserId && config.adminPassword) {
      try {
        await auth.deleteUser(createdUserId, 'admin');
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ===========================================================================
  // OIDC DISCOVERY
  // ===========================================================================

  describe('OIDC Discovery', () => {
    it('should fetch discovery document', async () => {
      const doc = await auth.getDiscoveryDocument();

      expect(doc).not.toBeNull();
      expect(doc!.issuer).toContain(config.clientId);
      expect(doc!.authorization_endpoint).toBeDefined();
      expect(doc!.token_endpoint).toBeDefined();
      expect(doc!.userinfo_endpoint).toBeDefined();
      expect(doc!.jwks_uri).toBeDefined();
    });

    it('should have correct issuer format', async () => {
      const doc = await auth.getDiscoveryDocument();

      // Kanidm uses client-specific issuers
      expect(doc!.issuer).toBe(
        `${config.serverUrl}/oauth2/openid/${config.clientId}`,
      );
    });

    it('should report correct capabilities', async () => {
      const capabilities = await auth.getCapabilities();

      expect(capabilities.authorizationCode).toBe(true);
      expect(capabilities.passwordGrant).toBe(false); // Not supported
      expect(capabilities.clientCredentials).toBe(false); // Not supported
      expect(capabilities.tokenRefresh).toBe(true);
      expect(capabilities.oidc).toBe(true);
      expect(capabilities.userManagement).toBe(true);
      expect(capabilities.sessionManagement).toBe(false);
      expect(capabilities.rbac).toBe(true);
      expect(capabilities.decentralized).toBe(false);
    });
  });

  // ===========================================================================
  // AUTHORIZATION CODE FLOW
  // ===========================================================================

  describe('Authorization Code Flow', () => {
    it('should generate authorization URL with PKCE', async () => {
      const result = await auth.getAuthorizationUrl({
        redirectUri: config.redirectUri,
        scopes: ['openid', 'profile', 'email', 'groups'],
        state: 'test-state',
      });

      expect(result.url).toContain(config.serverUrl);
      expect(result.url).toContain('response_type=code');
      expect(result.url).toContain('client_id=' + config.clientId);
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('scope=');
      expect(result.url).toContain('state=test-state');
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');

      // PKCE is always enabled for Kanidm
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier!.length).toBeGreaterThan(40);
      expect(result.state).toBe('test-state');
    });

    it('should generate random state if not provided', async () => {
      const result = await auth.getAuthorizationUrl({
        redirectUri: config.redirectUri,
      });

      expect(result.state).toBeDefined();
      expect(result.state!.length).toBeGreaterThan(10);
    });

    it('should include nonce for ID token validation', async () => {
      const result = await auth.getAuthorizationUrl({
        redirectUri: config.redirectUri,
        nonce: 'test-nonce',
      });

      expect(result.url).toContain('nonce=test-nonce');
      expect(result.nonce).toBe('test-nonce');
    });
  });

  // ===========================================================================
  // AUTHENTICATE (Not Supported)
  // ===========================================================================

  describe('Direct Authentication', () => {
    it('should throw NotImplementedError for password grant', async () => {
      await expect(
        auth.authenticate({
          grantType: 'password',
          username: 'testuser',
          password: 'testpass',
        }),
      ).rejects.toThrow(NotImplementedError);
    });

    it('should throw NotImplementedError for client credentials', async () => {
      await expect(
        auth.authenticate({
          grantType: 'client_credentials',
        }),
      ).rejects.toThrow(NotImplementedError);
    });
  });

  // ===========================================================================
  // USER MANAGEMENT (Admin API)
  // ===========================================================================

  describe('User Management (Admin API)', () => {
    const timestamp = Date.now();
    const testUserData = {
      username: `integration-test-user-${timestamp}`,
      email: `test-${timestamp}@example.com`,
      firstName: 'Integration',
      lastName: 'Test',
    };

    // Skip user management tests if admin credentials not provided
    const skipAdminTests = !config.adminPassword;

    (skipAdminTests ? it.skip : it)('should create a new user', async () => {
      const user = await auth.createUser(testUserData, 'admin');

      expect(user.id).toBeDefined();
      expect(user.username).toBe(testUserData.username);
      expect(user.email).toBe(testUserData.email);

      createdUserId = user.id;
    });

    (skipAdminTests ? it.skip : it)('should get user by ID', async () => {
      if (!createdUserId) {
        console.log('Skipping: user not created');
        return;
      }

      const user = await auth.getUser(createdUserId, 'admin');

      expect(user.id).toBeDefined();
      expect(user.username).toBe(testUserData.username);
    });

    (skipAdminTests ? it.skip : it)('should list users', async () => {
      const result = await auth.listUsers({}, 'admin');

      expect(result.users).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    (skipAdminTests ? it.skip : it)('should update user', async () => {
      if (!createdUserId) {
        console.log('Skipping: user not created');
        return;
      }

      const updated = await auth.updateUser(
        createdUserId,
        {
          firstName: 'Updated',
          lastName: 'User',
        },
        'admin',
      );

      expect(updated.displayName).toContain('Updated');
    });

    (skipAdminTests ? it.skip : it)('should delete user', async () => {
      if (!createdUserId) {
        console.log('Skipping: user not created');
        return;
      }

      await auth.deleteUser(createdUserId, 'admin');

      // Verify user is deleted
      await expect(auth.getUser(createdUserId, 'admin')).rejects.toThrow();

      createdUserId = undefined; // Prevent afterAll cleanup
    });
  });

  // ===========================================================================
  // SESSION MANAGEMENT (Not Supported)
  // ===========================================================================

  describe('Session Management', () => {
    it('should throw NotImplementedError for listSessions', async () => {
      await expect(auth.listSessions('user-id', 'admin')).rejects.toThrow(
        NotImplementedError,
      );
    });

    it('should throw NotImplementedError for revokeSession', async () => {
      await expect(auth.revokeSession('session-id', 'admin')).rejects.toThrow(
        NotImplementedError,
      );
    });

    it('should throw NotImplementedError for revokeAllSessions', async () => {
      await expect(auth.revokeAllSessions('user-id', 'admin')).rejects.toThrow(
        NotImplementedError,
      );
    });
  });

  // ===========================================================================
  // ROLE-BASED ACCESS CONTROL
  // ===========================================================================

  describe('Role-Based Access Control', () => {
    it('should throw NotImplementedError for assignRole', async () => {
      await expect(auth.assignRole('user-id', 'role', 'admin')).rejects.toThrow(
        NotImplementedError,
      );
    });

    it('should throw NotImplementedError for removeRole', async () => {
      await expect(auth.removeRole('user-id', 'role', 'admin')).rejects.toThrow(
        NotImplementedError,
      );
    });

    // getRoles and hasRole should work via token claims
    it('should return empty roles for non-existent user', async () => {
      const roles = await auth.getRoles('non-existent-user');
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBe(0);
    });
  });

  // ===========================================================================
  // PASSWORD RESET (Not Supported)
  // ===========================================================================

  describe('Password Reset', () => {
    it('should throw NotImplementedError for requestPasswordReset', async () => {
      await expect(
        auth.requestPasswordReset('user@example.com'),
      ).rejects.toThrow(NotImplementedError);
    });

    it('should throw NotImplementedError for resetPassword', async () => {
      await expect(auth.resetPassword('token', 'newpass')).rejects.toThrow(
        NotImplementedError,
      );
    });
  });

  // ===========================================================================
  // PROFILE UPDATE (Not Supported via OAuth2)
  // ===========================================================================

  describe('Profile Update', () => {
    it('should throw NotImplementedError for updateProfile', async () => {
      await expect(
        auth.updateProfile('token', { firstName: 'Test' }),
      ).rejects.toThrow(NotImplementedError);
    });
  });

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  describe('Logout', () => {
    it('should not throw when revoking tokens', async () => {
      // Logout should succeed even with invalid tokens
      // (it's a best-effort operation)
      await expect(
        auth.logout({
          token: 'invalid-token',
          refreshToken: 'invalid-refresh-token',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw NotImplementedError with proper structure', async () => {
      try {
        await auth.authenticate({
          grantType: 'password',
          username: 'test',
          password: 'test',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as NotImplementedError).provider).toBe('kanidm');
      }
    });

    it('should serialize errors to JSON', async () => {
      try {
        await auth.authenticate({
          grantType: 'password',
          username: 'test',
          password: 'test',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        const json = error.toJSON();
        expect(json.name).toBe('NotImplementedError');
        expect(json.provider).toBe('kanidm');
      }
    });
  });
});
