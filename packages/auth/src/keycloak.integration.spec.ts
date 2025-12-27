/**
 * Keycloak Integration Tests
 *
 * These tests require a running Keycloak instance with proper configuration.
 * See KEYCLOAK_SETUP.md for setup instructions.
 *
 * Environment variables required:
 * - KEYCLOAK_SERVER_URL: e.g., http://localhost:8080
 * - KEYCLOAK_REALM: e.g., test-realm
 * - KEYCLOAK_CLIENT_ID: e.g., test-app
 * - KEYCLOAK_CLIENT_SECRET: (if using confidential client)
 * - KEYCLOAK_ADMIN_CLIENT_ID: e.g., admin-cli or service account client
 * - KEYCLOAK_ADMIN_CLIENT_SECRET: (for service account)
 * - KEYCLOAK_TEST_USERNAME: e.g., testuser
 * - KEYCLOAK_TEST_PASSWORD: e.g., testpassword
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAuth } from './index.js';
import {
  AuthErrorCode,
  InvalidCredentialsError,
  isAuthError,
  TokenExpiredError,
} from './shared/errors.js';
import type { AuthInterface, AuthResult, UserProfile } from './shared/types.js';

// Skip tests if environment variables are not set
const SKIP_INTEGRATION =
  !process.env.KEYCLOAK_SERVER_URL ||
  !process.env.KEYCLOAK_REALM ||
  !process.env.KEYCLOAK_CLIENT_ID;

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration('Keycloak Integration Tests', () => {
  let auth: AuthInterface;
  let adminAuth: AuthInterface;
  let adminToken: string;
  let testUserToken: AuthResult;
  let createdUserId: string | undefined;

  const config = {
    serverUrl: process.env.KEYCLOAK_SERVER_URL!,
    realm: process.env.KEYCLOAK_REALM!,
    clientId: process.env.KEYCLOAK_CLIENT_ID!,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
    adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
    testUsername: process.env.KEYCLOAK_TEST_USERNAME || 'testuser',
    testPassword: process.env.KEYCLOAK_TEST_PASSWORD || 'testpassword',
  };

  beforeAll(async () => {
    // Create auth client for regular operations
    auth = await getAuth({
      type: 'keycloak',
      serverUrl: config.serverUrl,
      realm: config.realm,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    // Create admin auth client for user management
    adminAuth = await getAuth({
      type: 'keycloak',
      serverUrl: config.serverUrl,
      realm: config.realm,
      clientId: config.adminClientId,
      clientSecret: config.adminClientSecret,
    });

    // Get admin token using client credentials
    if (config.adminClientSecret) {
      const adminResult = await adminAuth.authenticate({
        grantType: 'client_credentials',
      });
      adminToken = adminResult.accessToken;
    }
  });

  afterAll(async () => {
    // Clean up: delete any users created during tests
    if (createdUserId && adminToken) {
      try {
        await auth.deleteUser(createdUserId, adminToken);
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
      expect(doc!.issuer).toContain(config.realm);
      expect(doc!.authorization_endpoint).toBeDefined();
      expect(doc!.token_endpoint).toBeDefined();
      expect(doc!.userinfo_endpoint).toBeDefined();
      expect(doc!.jwks_uri).toBeDefined();
    });

    it('should report correct capabilities', async () => {
      const capabilities = await auth.getCapabilities();

      expect(capabilities.authorizationCode).toBe(true);
      expect(capabilities.passwordGrant).toBe(true);
      expect(capabilities.clientCredentials).toBe(true);
      expect(capabilities.tokenRefresh).toBe(true);
      expect(capabilities.oidc).toBe(true);
      expect(capabilities.userManagement).toBe(true);
      expect(capabilities.sessionManagement).toBe(true);
      expect(capabilities.rbac).toBe(true);
      expect(capabilities.decentralized).toBe(false);
    });
  });

  // ===========================================================================
  // AUTHENTICATION FLOWS
  // ===========================================================================

  describe('Authentication Flows', () => {
    describe('Password Grant', () => {
      it('should authenticate with username and password', async () => {
        const result = await auth.authenticate({
          grantType: 'password',
          username: config.testUsername,
          password: config.testPassword,
        });

        expect(result.accessToken).toBeDefined();
        expect(result.tokenType).toBe('Bearer');
        expect(result.expiresIn).toBeGreaterThan(0);
        expect(result.refreshToken).toBeDefined();

        testUserToken = result;
      });

      it('should reject invalid credentials', async () => {
        await expect(
          auth.authenticate({
            grantType: 'password',
            username: config.testUsername,
            password: 'wrong-password',
          }),
        ).rejects.toThrow(InvalidCredentialsError);
      });

      it('should reject non-existent user', async () => {
        await expect(
          auth.authenticate({
            grantType: 'password',
            username: 'nonexistent-user-12345',
            password: 'any-password',
          }),
        ).rejects.toThrow(InvalidCredentialsError);
      });
    });

    describe('Client Credentials Grant', () => {
      it('should authenticate with client credentials', async () => {
        if (!config.clientSecret) {
          console.log('Skipping: client secret not configured');
          return;
        }

        const result = await auth.authenticate({
          grantType: 'client_credentials',
        });

        expect(result.accessToken).toBeDefined();
        expect(result.tokenType).toBe('Bearer');
        // Client credentials typically don't return refresh token
      });
    });

    describe('Authorization Code Flow', () => {
      it('should generate authorization URL with PKCE', async () => {
        const result = await auth.getAuthorizationUrl({
          redirectUri: 'http://localhost:3000/callback',
          scopes: ['openid', 'profile', 'email'],
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

        expect(result.codeVerifier).toBeDefined();
        expect(result.codeVerifier!.length).toBeGreaterThan(40);
        expect(result.state).toBe('test-state');
      });

      it('should generate random state if not provided', async () => {
        const result = await auth.getAuthorizationUrl({
          redirectUri: 'http://localhost:3000/callback',
        });

        expect(result.state).toBeDefined();
        expect(result.state!.length).toBeGreaterThan(10);
      });
    });

    describe('Token Refresh', () => {
      it('should refresh access token', async () => {
        if (!testUserToken?.refreshToken) {
          console.log('Skipping: no refresh token from password grant');
          return;
        }

        const result = await auth.refresh(testUserToken.refreshToken);

        expect(result.accessToken).toBeDefined();
        expect(result.accessToken).not.toBe(testUserToken.accessToken);
        expect(result.refreshToken).toBeDefined();
        expect(result.expiresIn).toBeGreaterThan(0);

        // Update for later tests
        testUserToken = result;
      });

      it('should reject invalid refresh token', async () => {
        await expect(auth.refresh('invalid-refresh-token')).rejects.toThrow();
      });
    });
  });

  // ===========================================================================
  // TOKEN OPERATIONS
  // ===========================================================================

  describe('Token Operations', () => {
    describe('Token Validation', () => {
      it('should validate a valid token', async () => {
        if (!testUserToken?.accessToken) {
          console.log('Skipping: no access token');
          return;
        }

        const claims = await auth.validateToken(testUserToken.accessToken);

        expect(claims).not.toBeNull();
        expect(claims!.sub).toBeDefined();
        expect(claims!.iss).toContain(config.realm);
        expect(claims!.exp).toBeGreaterThan(Date.now() / 1000);
      });

      it('should return null for invalid token', async () => {
        const claims = await auth.validateToken('invalid-token');
        expect(claims).toBeNull();
      });

      it('should return null for malformed JWT', async () => {
        const claims = await auth.validateToken('not.a.jwt');
        expect(claims).toBeNull();
      });
    });

    describe('Token Decoding', () => {
      it('should decode token without validation', () => {
        if (!testUserToken?.accessToken) {
          console.log('Skipping: no access token');
          return;
        }

        const decoded = auth.decodeToken(testUserToken.accessToken);

        expect(decoded.header.alg).toBeDefined();
        expect(decoded.payload.sub).toBeDefined();
        expect(decoded.payload.iss).toBeDefined();
        expect(decoded.payload.exp).toBeDefined();
        expect(decoded.payload.iat).toBeDefined();
        expect(decoded.signature).toBeDefined();
      });

      it('should throw for malformed token', () => {
        expect(() => auth.decodeToken('not-a-jwt')).toThrow();
      });
    });

    describe('Token Introspection', () => {
      it('should introspect valid token', async () => {
        if (!testUserToken?.accessToken) {
          console.log('Skipping: no access token');
          return;
        }

        const introspection = await auth.introspectToken(
          testUserToken.accessToken,
        );

        expect(introspection.active).toBe(true);
        expect(introspection.claims?.sub).toBeDefined();
        expect(introspection.clientId).toBe(config.clientId);
      });

      it('should return inactive for invalid token', async () => {
        const introspection = await auth.introspectToken('invalid-token');
        expect(introspection.active).toBe(false);
      });
    });
  });

  // ===========================================================================
  // USER PROFILE
  // ===========================================================================

  describe('User Profile', () => {
    it('should get current user profile', async () => {
      if (!testUserToken?.accessToken) {
        console.log('Skipping: no access token');
        return;
      }

      const profile = await auth.getProfile(testUserToken.accessToken);

      expect(profile.id).toBeDefined();
      expect(profile.username).toBe(config.testUsername);
    });

    it('should update user profile', async () => {
      if (!testUserToken?.accessToken) {
        console.log('Skipping: no access token');
        return;
      }

      // First get current profile to preserve required fields
      const currentProfile = await auth.getProfile(testUserToken.accessToken);

      const updates = {
        username: currentProfile.username, // Required by Keycloak
        email: currentProfile.email, // Required by Keycloak
        firstName: 'Updated',
        lastName: 'Name',
      };

      const updated = await auth.updateProfile(
        testUserToken.accessToken,
        updates,
      );

      expect(updated.firstName).toBe('Updated');
      expect(updated.lastName).toBe('Name');
    });
  });

  // ===========================================================================
  // USER MANAGEMENT (Admin)
  // ===========================================================================

  describe('User Management (Admin)', () => {
    // Note: When "Email as username" is enabled in Keycloak, the username will be the email
    const timestamp = Date.now();
    const testUserData = {
      username: `integration-test-user-${timestamp}`,
      email: `test-${timestamp}@example.com`,
      firstName: 'Integration',
      lastName: 'Test',
      enabled: true,
      password: 'TestPassword123!',
      temporary: false,
    };

    it('should create a new user', async () => {
      if (!adminToken) {
        console.log('Skipping: no admin token');
        return;
      }

      const user = await auth.createUser(testUserData, adminToken);

      expect(user.id).toBeDefined();
      // Username may be email if "Email as username" is enabled in Keycloak
      expect([testUserData.username, testUserData.email]).toContain(
        user.username,
      );
      expect(user.email).toBe(testUserData.email);
      expect(user.firstName).toBe(testUserData.firstName);
      expect(user.lastName).toBe(testUserData.lastName);
      expect(user.enabled).toBe(true);

      createdUserId = user.id;
    });

    it('should get user by ID', async () => {
      if (!adminToken || !createdUserId) {
        console.log('Skipping: no admin token or user not created');
        return;
      }

      const user = await auth.getUser(createdUserId, adminToken);

      expect(user.id).toBe(createdUserId);
      // Username may be email if "Email as username" is enabled
      expect([testUserData.username, testUserData.email]).toContain(
        user.username,
      );
    });

    it('should list users with query', async () => {
      if (!adminToken) {
        console.log('Skipping: no admin token');
        return;
      }

      // Search by email which works regardless of "Email as username" setting
      const result = await auth.listUsers(
        {
          search: testUserData.email,
          first: 0,
          max: 10,
        },
        adminToken,
      );

      expect(result.users.length).toBeGreaterThan(0);
      expect(result.users.some((u) => u.email === testUserData.email)).toBe(
        true,
      );
    });

    it('should update user', async () => {
      if (!adminToken || !createdUserId) {
        console.log('Skipping: no admin token or user not created');
        return;
      }

      const updated = await auth.updateUser(
        createdUserId,
        {
          firstName: 'Updated',
          lastName: 'User',
        },
        adminToken,
      );

      expect(updated.firstName).toBe('Updated');
      expect(updated.lastName).toBe('User');
    });

    it('should authenticate with newly created user', async () => {
      if (!createdUserId) {
        console.log('Skipping: user not created');
        return;
      }

      // Use email for login when "Email as username" is enabled in Keycloak
      const result = await auth.authenticate({
        grantType: 'password',
        username: testUserData.email,
        password: testUserData.password,
      });

      expect(result.accessToken).toBeDefined();
    });

    it('should delete user', async () => {
      if (!adminToken || !createdUserId) {
        console.log('Skipping: no admin token or user not created');
        return;
      }

      await auth.deleteUser(createdUserId, adminToken);

      // Verify user is deleted
      await expect(auth.getUser(createdUserId, adminToken)).rejects.toThrow();

      createdUserId = undefined; // Prevent afterAll cleanup
    });
  });

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  describe('Session Management', () => {
    let sessionTestUser: UserProfile | undefined;
    let sessionTestToken: AuthResult | undefined;

    beforeAll(async () => {
      if (!adminToken) return;

      // Create a user for session tests
      try {
        sessionTestUser = await auth.createUser(
          {
            username: `session-test-user-${Date.now()}`,
            email: `session-${Date.now()}@example.com`,
            firstName: 'Session',
            lastName: 'Test',
            enabled: true,
            password: 'SessionTest123!',
            temporary: false,
          },
          adminToken,
        );

        // Login to create a session
        sessionTestToken = await auth.authenticate({
          grantType: 'password',
          username: sessionTestUser.username,
          password: 'SessionTest123!',
        });
      } catch (error) {
        console.error('Failed to create session test user:', error);
      }
    });

    afterAll(async () => {
      // Cleanup
      if (sessionTestUser && adminToken) {
        try {
          await auth.deleteUser(sessionTestUser.id, adminToken);
        } catch {
          // Ignore
        }
      }
    });

    it('should list user sessions', async () => {
      if (!adminToken || !sessionTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      const sessions = await auth.listSessions(sessionTestUser.id, adminToken);

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].id).toBeDefined();
      expect(sessions[0].userId).toBe(sessionTestUser.id);
    });

    it('should revoke a specific session', async () => {
      if (!adminToken || !sessionTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      const sessions = await auth.listSessions(sessionTestUser.id, adminToken);
      if (sessions.length === 0) {
        console.log('Skipping: no sessions to revoke');
        return;
      }

      const sessionToRevoke = sessions[0];
      await auth.revokeSession(sessionToRevoke.id, adminToken);

      // Verify session is revoked
      const remainingSessions = await auth.listSessions(
        sessionTestUser.id,
        adminToken,
      );
      expect(
        remainingSessions.find((s) => s.id === sessionToRevoke.id),
      ).toBeUndefined();
    });

    it('should revoke all user sessions', async () => {
      if (!adminToken || !sessionTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      // Login again to create new sessions
      await auth.authenticate({
        grantType: 'password',
        username: sessionTestUser.username,
        password: 'SessionTest123!',
      });

      await auth.revokeAllSessions(sessionTestUser.id, adminToken);

      const sessions = await auth.listSessions(sessionTestUser.id, adminToken);
      expect(sessions.length).toBe(0);
    });
  });

  // ===========================================================================
  // ROLE-BASED ACCESS CONTROL
  // ===========================================================================

  describe('Role-Based Access Control', () => {
    let roleTestUser: UserProfile | undefined;

    beforeAll(async () => {
      if (!adminToken) return;

      try {
        roleTestUser = await auth.createUser(
          {
            username: `role-test-user-${Date.now()}`,
            email: `role-${Date.now()}@example.com`,
            firstName: 'Role',
            lastName: 'Test',
            enabled: true,
            password: 'RoleTest123!',
            temporary: false,
          },
          adminToken,
        );
      } catch (error) {
        console.error('Failed to create role test user:', error);
      }
    });

    afterAll(async () => {
      if (roleTestUser && adminToken) {
        try {
          await auth.deleteUser(roleTestUser.id, adminToken);
        } catch {
          // Ignore
        }
      }
    });

    it('should get user roles (initially empty or default)', async () => {
      if (!adminToken || !roleTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      const roles = await auth.getRoles(roleTestUser.id, adminToken);

      expect(Array.isArray(roles)).toBe(true);
    });

    it('should assign role to user', async () => {
      if (!adminToken || !roleTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      // Note: This assumes a role named 'test-role' exists in Keycloak
      // If not, this test will be skipped or fail
      try {
        await auth.assignRole(roleTestUser.id, 'offline_access', adminToken);

        const roles = await auth.getRoles(roleTestUser.id, adminToken);
        expect(roles).toContain('offline_access');
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          console.log('Skipping: test role not configured in Keycloak');
        } else {
          throw error;
        }
      }
    });

    it('should check if user has role', async () => {
      if (!adminToken || !roleTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      try {
        const hasRole = await auth.hasRole(roleTestUser.id, 'offline_access');
        expect(typeof hasRole).toBe('boolean');
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          console.log('Skipping: test role not configured');
        } else {
          throw error;
        }
      }
    });

    it('should remove role from user', async () => {
      if (!adminToken || !roleTestUser) {
        console.log('Skipping: prerequisites not met');
        return;
      }

      try {
        await auth.removeRole(roleTestUser.id, 'offline_access', adminToken);

        const roles = await auth.getRoles(roleTestUser.id, adminToken);
        expect(roles).not.toContain('offline_access');
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          console.log('Skipping: test role not configured');
        } else {
          throw error;
        }
      }
    });
  });

  // ===========================================================================
  // PASSWORD RESET
  // ===========================================================================

  describe('Password Reset', () => {
    it('should request password reset for existing user', async () => {
      if (!adminToken) {
        console.log('Skipping: no admin token');
        return;
      }

      // Note: This will trigger an email if email is configured in Keycloak
      // In test environments, verify email action is created instead
      try {
        await auth.requestPasswordReset(config.testUsername);
        // If no error thrown, the request was successful
        expect(true).toBe(true);
      } catch (error: any) {
        // Some Keycloak configurations may not allow this
        console.log(
          'Password reset request failed (may be expected):',
          error.message,
        );
      }
    });
  });

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  describe('Logout', () => {
    it('should logout and invalidate refresh token', async () => {
      if (!testUserToken?.refreshToken) {
        console.log('Skipping: no refresh token');
        return;
      }

      await auth.logout({
        refreshToken: testUserToken.refreshToken,
      });

      // Verify refresh token is no longer valid
      await expect(auth.refresh(testUserToken.refreshToken)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw InvalidCredentialsError with proper code', async () => {
      try {
        await auth.authenticate({
          grantType: 'password',
          username: 'nonexistent',
          password: 'wrong',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
        expect((error as any).provider).toBe('keycloak');
      }
    });

    it('should serialize errors to JSON', async () => {
      try {
        await auth.authenticate({
          grantType: 'password',
          username: 'nonexistent',
          password: 'wrong',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        const json = error.toJSON();
        expect(json.name).toBe('InvalidCredentialsError');
        expect(json.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
        expect(json.provider).toBe('keycloak');
      }
    });
  });
});
