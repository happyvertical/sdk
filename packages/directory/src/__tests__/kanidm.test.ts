/**
 * Tests for Kanidm directory adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanidmAdapter } from '../adapters/kanidm.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../shared/errors.js';
import type { KanidmOptions } from '../shared/types.js';

const OPTIONS: KanidmOptions = {
  type: 'kanidm',
  baseUrl: 'https://idm.example.com',
  adminUsername: 'admin',
  adminPassword: 'secret',
  timeout: 5000,
};

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Mock the 3-step Kanidm auth flow.
 * After first call, the token is cached for 1h so subsequent
 * request() calls reuse it without re-authenticating.
 */
function mockAuthFlow() {
  // Step 1: init2
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ 'set-cookie': 'session=abc123' }),
    json: async () => ({}),
  });
  // Step 2: begin
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({}),
  });
  // Step 3: cred
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ state: { success: 'token-abc' } }),
  });
}

function mockOkResponse(response: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
  });
}

function mockErrorResponse(status: number, body = '') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: `Error ${status}`,
    text: async () => body,
  });
}

describe('KanidmAdapter', () => {
  let adapter: KanidmAdapter;

  beforeEach(() => {
    adapter = new KanidmAdapter(OPTIONS);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('should return true when auth succeeds', async () => {
      mockAuthFlow();
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when auth fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => 'Unauthorized',
      });
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('user CRUD', () => {
    it('should create a user', async () => {
      mockAuthFlow();
      // POST /v1/person
      mockOkResponse({});
      // GET /v1/person/alice (token cached, no re-auth)
      mockOkResponse({
        attrs: {
          name: ['alice'],
          displayname: ['Alice Smith'],
          mail: ['alice@example.com'],
          uuid: ['uuid-alice'],
        },
      });

      const user = await adapter.createUser({
        username: 'alice',
        displayName: 'Alice Smith',
        email: 'alice@example.com',
      });

      expect(user.username).toBe('alice');
      expect(user.displayName).toBe('Alice Smith');
      expect(user.email).toBe('alice@example.com');
    });

    it('should get a user', async () => {
      mockAuthFlow();
      mockOkResponse({
        attrs: {
          name: ['bob'],
          displayname: ['Bob Jones'],
          mail: ['bob@example.com'],
          uuid: ['uuid-bob'],
        },
      });

      const user = await adapter.getUser('bob');
      expect(user.username).toBe('bob');
      expect(user.displayName).toBe('Bob Jones');
    });

    it('should throw NotFoundError for missing user', async () => {
      mockAuthFlow();
      mockErrorResponse(404, 'Not found');

      await expect(adapter.getUser('missing')).rejects.toThrow(NotFoundError);
    });

    it('should list users', async () => {
      mockAuthFlow();
      mockOkResponse([
        {
          attrs: {
            name: ['alice'],
            displayname: ['Alice'],
            uuid: ['uuid-alice'],
          },
        },
        {
          attrs: {
            name: ['bob'],
            displayname: ['Bob'],
            uuid: ['uuid-bob'],
          },
        },
      ]);

      const users = await adapter.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].username).toBe('alice');
      expect(users[1].username).toBe('bob');
    });

    it('should update a user', async () => {
      mockAuthFlow();
      // PATCH /v1/person/alice
      mockOkResponse({});
      // GET /v1/person/alice (token cached)
      mockOkResponse({
        attrs: {
          name: ['alice'],
          displayname: ['Alice Updated'],
          uuid: ['uuid-alice'],
        },
      });

      const user = await adapter.updateUser('alice', {
        displayName: 'Alice Updated',
      });
      expect(user.displayName).toBe('Alice Updated');
    });

    it('should delete a user', async () => {
      mockAuthFlow();
      mockOkResponse({});

      await expect(adapter.deleteUser('alice')).resolves.toBeUndefined();
    });
  });

  describe('group CRUD', () => {
    it('should create a group', async () => {
      mockAuthFlow();
      // POST /v1/group
      mockOkResponse({});
      // GET /v1/group/developers (token cached)
      mockOkResponse({
        attrs: {
          name: ['developers'],
          description: ['Dev team'],
          uuid: ['uuid-devs'],
        },
      });

      const group = await adapter.createGroup({
        name: 'developers',
        description: 'Dev team',
      });

      expect(group.name).toBe('developers');
    });

    it('should list groups', async () => {
      mockAuthFlow();
      mockOkResponse([
        { attrs: { name: ['developers'], uuid: ['uuid-devs'] } },
        { attrs: { name: ['admins'], uuid: ['uuid-admins'] } },
      ]);

      const groups = await adapter.listGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('membership', () => {
    it('should add user to group', async () => {
      mockAuthFlow();
      mockOkResponse({});

      await expect(
        adapter.addUserToGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should remove user from group', async () => {
      mockAuthFlow();
      mockOkResponse({});

      await expect(
        adapter.removeUserFromGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });
  });

  describe('OAuth2', () => {
    it('should create an OAuth2 client', async () => {
      mockAuthFlow();
      // POST /v1/oauth2
      mockOkResponse({});
      // GET /v1/oauth2/myapp (token cached)
      mockOkResponse({
        attrs: {
          oauth2_rs_name: ['myapp'],
          displayname: ['My App'],
          oauth2_rs_origin: ['https://app.example.com/callback'],
          uuid: ['uuid-myapp'],
        },
      });

      const client = await adapter.createOAuth2Client({
        name: 'myapp',
        displayName: 'My App',
        redirectUris: ['https://app.example.com/callback'],
      });

      expect(client.name).toBe('myapp');
    });

    it('should get OAuth2 client secret', async () => {
      mockAuthFlow();
      mockOkResponse('supersecret');

      const secret = await adapter.getOAuth2ClientSecret('myapp');
      expect(secret).toBe('supersecret');
    });

    it('should list OAuth2 clients', async () => {
      mockAuthFlow();
      mockOkResponse([
        { attrs: { oauth2_rs_name: ['app1'], uuid: ['uuid-app1'] } },
        { attrs: { oauth2_rs_name: ['app2'], uuid: ['uuid-app2'] } },
      ]);

      const clients = await adapter.listOAuth2Clients();
      expect(clients).toHaveLength(2);
    });
  });

  describe('auth caching', () => {
    it('should reuse cached token within expiry window', async () => {
      mockAuthFlow();
      mockOkResponse({
        attrs: { name: ['alice'], uuid: ['uuid-alice'] },
      });

      await adapter.getUser('alice');

      // Second call should NOT trigger another auth flow
      mockOkResponse({
        attrs: { name: ['bob'], uuid: ['uuid-bob'] },
      });

      await adapter.getUser('bob');

      // Auth flow is 3 calls, each getUser is 1 call
      // First: 3 auth + 1 request = 4
      // Second: 0 auth + 1 request = 1
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('error handling', () => {
    it('should throw ConflictError on 409', async () => {
      mockAuthFlow();
      mockErrorResponse(409, 'Already exists');

      await expect(adapter.createUser({ username: 'alice' })).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => 'Unauthorized',
      });

      await expect(adapter.getUser('alice')).rejects.toThrow(
        AuthenticationError,
      );
    });
  });
});
