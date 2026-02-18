/**
 * Tests for PostgreSQL directory adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import type { PostgresOptions } from '../shared/types.js';

// Mock the pg module
const mockQuery = vi.fn();
const mockEnd = vi.fn();
const mockConnect = vi.fn();

vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = mockConnect;
      query = mockQuery;
      end = mockEnd;
    },
  },
}));

const OPTIONS: PostgresOptions = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  adminUser: 'postgres',
  adminPassword: 'secret',
  database: 'postgres',
};

/** Reusable role row factory */
function roleRow(name: string, login: boolean) {
  return {
    rolname: name,
    rolcanlogin: login,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
  };
}

describe('PostgresAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: any;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockEnd.mockReset();
    mockConnect.mockReset();

    const { PostgresAdapter } = await import('../adapters/postgres.js');
    adapter = new PostgresAdapter(OPTIONS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('testConnection', () => {
    it('should return true when query succeeds', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('user CRUD (PostgreSQL roles with LOGIN)', () => {
    it('should create a user (role with LOGIN)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // CREATE ROLE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getUser SELECT (called internally after create)
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('alice', true)],
      });

      const user = await adapter.createUser({
        username: 'alice',
        password: 'password123',
      });

      expect(user.username).toBe('alice');
      expect(user.id).toBe('alice');
    });

    it('should get a user', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('alice', true)],
      });

      const user = await adapter.getUser('alice');
      expect(user.username).toBe('alice');
      expect(user.active).toBe(true);
    });

    it('should throw NotFoundError for missing user', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(adapter.getUser('missing')).rejects.toThrow(NotFoundError);
    });

    it('should list users (login roles only)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('alice', true), roleRow('bob', true)],
      });

      const users = await adapter.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].username).toBe('alice');
    });

    it('should delete a user', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // getUser SELECT (verify exists)
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('alice', true)],
      });
      // DROP ROLE
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(adapter.deleteUser('alice')).resolves.toBeUndefined();
    });

    it('should throw ConflictError on duplicate role', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      const error = new Error('role "alice" already exists');
      (error as NodeJS.ErrnoException).code = '42710';
      mockQuery.mockRejectedValueOnce(error);

      await expect(
        adapter.createUser({ username: 'alice', password: 'pass' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('group CRUD (PostgreSQL roles without LOGIN)', () => {
    it('should create a group', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // CREATE ROLE NOLOGIN
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getGroup SELECT (called internally after create)
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('developers', false)],
      });

      const group = await adapter.createGroup({ name: 'developers' });
      expect(group.name).toBe('developers');
    });

    it('should list groups (non-login roles, excluding system)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('developers', false), roleRow('admins', false)],
      });

      const groups = await adapter.listGroups();
      expect(groups).toHaveLength(2);
    });
  });

  describe('membership', () => {
    it('should add user to group (GRANT)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.addUserToGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should remove user from group (REVOKE)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.removeUserFromGroup('alice', 'developers'),
      ).resolves.toBeUndefined();
    });

    it('should get group members', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // getGroup SELECT (verify exists)
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('developers', false)],
      });
      // Members query
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('alice', true), roleRow('bob', true)],
      });

      const members = await adapter.getGroupMembers('developers');
      expect(members).toHaveLength(2);
    });
  });

  describe('database provisioning', () => {
    it('should create a database', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // CREATE DATABASE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getDatabase SELECT (called internally after create)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { datname: 'mydb', owner: 'alice', encoding: 'UTF8', size: '8 MB' },
        ],
      });

      const db = await adapter.createDatabase({
        name: 'mydb',
        owner: 'alice',
      });
      expect(db.name).toBe('mydb');
      expect(db.owner).toBe('alice');
    });

    it('should list databases (excluding system)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({
        rows: [
          { datname: 'mydb', owner: 'alice', encoding: 'UTF8', size: '8 MB' },
          { datname: 'app', owner: 'bob', encoding: 'UTF8', size: '16 MB' },
        ],
      });

      const dbs = await adapter.listDatabases();
      expect(dbs).toHaveLength(2);
    });

    it('should drop a database', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // getDatabase SELECT (verify exists)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { datname: 'mydb', owner: 'alice', encoding: 'UTF8', size: '8 MB' },
        ],
      });
      // DROP DATABASE
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(adapter.dropDatabase('mydb')).resolves.toBeUndefined();
    });
  });

  describe('role provisioning', () => {
    it('should create a role', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      // CREATE ROLE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getRole SELECT (called internally after create)
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('app_user', true)],
      });

      const role = await adapter.createRole({
        name: 'app_user',
        password: 'pass',
        login: true,
      });
      expect(role.name).toBe('app_user');
      expect(role.login).toBe(true);
    });

    it('should list roles (excluding system)', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({
        rows: [roleRow('app_user', true)],
      });

      const roles = await adapter.listRoles();
      expect(roles).toHaveLength(1);
    });
  });

  describe('access control', () => {
    it('should grant access', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.grantAccess('alice', 'mydb'),
      ).resolves.toBeUndefined();
    });

    it('should revoke access', async () => {
      mockConnect.mockResolvedValueOnce(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.revokeAccess('alice', 'mydb'),
      ).resolves.toBeUndefined();
    });
  });
});
