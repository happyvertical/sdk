/**
 * Tests for Stalwart directory adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StalwartAdapter } from '../adapters/stalwart.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../shared/errors.js';
import type { StalwartOptions } from '../shared/types.js';

const OPTIONS: StalwartOptions = {
  type: 'stalwart',
  baseUrl: 'https://mail.example.com',
  username: 'admin',
  password: 'secret',
  timeout: 5000,
};

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockRequest(response: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

describe('StalwartAdapter', () => {
  let adapter: StalwartAdapter;

  beforeEach(() => {
    adapter = new StalwartAdapter(OPTIONS);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('testConnection', () => {
    it('should return true when connection succeeds', async () => {
      mockRequest([]);
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('user CRUD', () => {
    it('should create a user', async () => {
      // POST /api/principal
      mockRequest({});
      // GET /api/principal/alice (getUser called after create)
      mockRequest({
        name: 'alice',
        description: 'Alice Smith',
        type: 'individual',
        emails: ['alice@example.com'],
      });

      const user = await adapter.createUser({
        username: 'alice',
        displayName: 'Alice Smith',
        email: 'alice@example.com',
      });

      expect(user.username).toBe('alice');
      expect(user.displayName).toBe('Alice Smith');
      const call = mockFetch.mock.calls[0];
      expect(call[1].method).toBe('POST');
      expect(call[0]).toContain('/api/principal');
    });

    it('should get a user', async () => {
      mockRequest({
        name: 'alice',
        description: 'Alice Smith',
        type: 'individual',
        emails: ['alice@example.com'],
      });

      const user = await adapter.getUser('alice');
      expect(user.username).toBe('alice');
      expect(user.displayName).toBe('Alice Smith');
      expect(user.email).toBe('alice@example.com');
    });

    it('should throw NotFoundError for missing user', async () => {
      mockRequest({ error: 'not-found' }, 404);
      await expect(adapter.getUser('missing')).rejects.toThrow(NotFoundError);
    });

    it('should list users', async () => {
      // GET /api/principal?type=individual returns name list
      mockRequest(['alice', 'bob']);
      // GET /api/principal/alice
      mockRequest({
        name: 'alice',
        description: 'Alice',
        type: 'individual',
      });
      // GET /api/principal/bob
      mockRequest({
        name: 'bob',
        description: 'Bob',
        type: 'individual',
      });

      const users = await adapter.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].username).toBe('alice');
    });

    it('should update a user', async () => {
      // PATCH /api/principal/alice
      mockRequest({});
      // GET /api/principal/alice (getUser called after update)
      mockRequest({
        name: 'alice',
        description: 'Alice Updated',
        type: 'individual',
      });

      const user = await adapter.updateUser('alice', {
        displayName: 'Alice Updated',
      });
      expect(user.displayName).toBe('Alice Updated');
    });

    it('should delete a user', async () => {
      mockRequest({});
      await expect(adapter.deleteUser('alice')).resolves.toBeUndefined();
    });
  });

  describe('group CRUD', () => {
    it('should create a group', async () => {
      // POST /api/principal
      mockRequest({});
      // GET /api/principal/developers (getGroup called after create)
      mockRequest({
        name: 'developers',
        description: 'Dev team',
        type: 'group',
      });

      const group = await adapter.createGroup({
        name: 'developers',
        description: 'Dev team',
      });

      expect(group.name).toBe('developers');
    });

    it('should list groups', async () => {
      // GET /api/principal?type=group returns name list
      mockRequest(['developers', 'admins']);
      // GET each group
      mockRequest({ name: 'developers', type: 'group' });
      mockRequest({ name: 'admins', type: 'group' });

      const groups = await adapter.listGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('membership', () => {
    it('should add user to group', async () => {
      // GET current group
      mockRequest({
        name: 'developers',
        type: 'group',
        members: ['bob'],
      });
      // PATCH group with updated members
      mockRequest({});

      await expect(
        adapter.addUserToGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should remove user from group', async () => {
      // GET current group
      mockRequest({
        name: 'developers',
        type: 'group',
        members: ['alice', 'bob'],
      });
      // PATCH group with updated members
      mockRequest({});

      await expect(
        adapter.removeUserFromGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });
  });

  describe('domain management', () => {
    it('should create a domain', async () => {
      // POST /api/principal
      mockRequest({});
      // GET /api/principal/example.com (getDomain called after create)
      mockRequest({
        name: 'example.com',
        type: 'domain',
      });

      const domain = await adapter.createDomain({ name: 'example.com' });
      expect(domain.name).toBe('example.com');
    });

    it('should list domains', async () => {
      // GET /api/principal?type=domain returns name list
      mockRequest(['example.com']);
      // GET each domain
      mockRequest({ name: 'example.com', type: 'domain' });

      const domains = await adapter.listDomains();
      expect(domains).toHaveLength(1);
      expect(domains[0].name).toBe('example.com');
    });

    it('should delete a domain', async () => {
      mockRequest({});
      await expect(
        adapter.deleteDomain('example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('DKIM', () => {
    it('should create a DKIM key', async () => {
      mockRequest({
        id: 'dkim-1',
        domain: 'example.com',
        selector: 'default',
      });

      const key = await adapter.createDkimKey({
        domain: 'example.com',
        selector: 'default',
      });
      expect(key.domain).toBe('example.com');
      expect(key.selector).toBe('default');
    });

    it('should get DNS records', async () => {
      mockRequest([
        {
          type: 'MX',
          name: 'example.com',
          value: 'mail.example.com',
          priority: 10,
        },
        { type: 'TXT', name: 'example.com', value: 'v=spf1 ...' },
      ]);

      const records = await adapter.getDnsRecords('example.com');
      expect(records).toHaveLength(2);
      expect(records[0].type).toBe('MX');
    });
  });

  describe('mailbox management', () => {
    it('should create a mailbox', async () => {
      // POST /api/principal
      mockRequest({});
      // GET /api/principal/alice (getMailbox called after create)
      mockRequest({
        name: 'alice',
        description: 'Alice',
        type: 'individual',
        emails: ['alice@example.com'],
        quota: 1024,
      });

      const mailbox = await adapter.createMailbox({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
        quota: 1024,
      });
      expect(mailbox.email).toBe('alice@example.com');
    });

    it('should list mailboxes', async () => {
      // GET /api/principal?type=individual returns name list
      mockRequest(['alice', 'bob']);
      // GET each principal
      mockRequest({
        name: 'alice',
        description: 'Alice',
        type: 'individual',
        emails: ['alice@example.com'],
        quota: 1024,
      });
      mockRequest({
        name: 'bob',
        description: 'Bob',
        type: 'individual',
        emails: ['bob@example.com'],
      });

      const mailboxes = await adapter.listMailboxes();
      expect(mailboxes).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw ConflictError on 409', async () => {
      // createUser does POST then would GET, but POST fails with 409
      mockRequest({ error: 'conflict' }, 409);
      await expect(adapter.createUser({ username: 'alice' })).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw AuthenticationError on 401', async () => {
      mockRequest({ error: 'unauthorized' }, 401);
      await expect(adapter.getUser('alice')).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('should include Basic auth header in requests', async () => {
      mockRequest({
        name: 'alice',
        type: 'individual',
      });

      await adapter.getUser('alice');

      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers;
      expect(headers.Authorization).toMatch(/^Basic /);
    });
  });
});
