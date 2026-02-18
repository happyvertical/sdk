/**
 * PostgreSQL directory adapter for @happyvertical/directory
 *
 * Maps PostgreSQL roles and databases to the DirectoryAdapter interface.
 * Uses the CNPG cluster admin role for provisioning operations.
 *
 * Concept mapping:
 * - DirectoryUser -> PostgreSQL role WITH LOGIN
 * - DirectoryGroup -> PostgreSQL role WITHOUT LOGIN (NOLOGIN)
 * - Membership -> GRANT role TO role
 * - PgDatabase -> PostgreSQL database
 * - PgRole -> PostgreSQL role (any)
 */

import pg from 'pg';
import {
  AuthenticationError,
  ConflictError,
  ConnectionError,
  DirectoryError,
  NotFoundError,
} from '../shared/errors.js';
import type {
  CreateGroupInput,
  CreatePgDatabaseInput,
  CreatePgRoleInput,
  CreateUserInput,
  DirectoryGroup,
  DirectoryUser,
  PgDatabase,
  PgRole,
  PostgresDirectoryAdapter,
  PostgresOptions,
  UpdateGroupInput,
  UpdateUserInput,
} from '../shared/types.js';

const { Client } = pg;

const PROVIDER = 'postgres';

/**
 * System roles excluded from list operations.
 * Includes PostgreSQL internal roles (pg_*) and the default superuser.
 */
const SYSTEM_ROLE_PREFIX = 'pg_';
const SYSTEM_ROLES = new Set(['postgres']);

/**
 * System databases excluded from list operations.
 */
const SYSTEM_DATABASES = new Set(['template0', 'template1', 'postgres']);

export class PostgresAdapter implements PostgresDirectoryAdapter {
  private options: PostgresOptions;
  private client: pg.Client | null = null;

  constructor(options: PostgresOptions) {
    this.options = options;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Escape a SQL identifier by wrapping in double quotes and escaping
   * any embedded double quotes. Used for DDL statements where
   * parameterized queries are not supported.
   */
  private escapeIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Escape a SQL string literal by wrapping in single quotes and escaping
   * any embedded single quotes. Used for DDL statements (e.g., passwords)
   * where parameterized queries are not supported.
   */
  private escapeLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Get or create the pg.Client instance. Connects lazily on first use.
   */
  private async getClient(): Promise<pg.Client> {
    if (this.client) {
      return this.client;
    }

    try {
      this.client = new Client({
        host: this.options.host,
        port: this.options.port ?? 5432,
        user: this.options.adminUser,
        password: this.options.adminPassword,
        database: this.options.database ?? 'postgres',
        ssl: this.options.ssl ? { rejectUnauthorized: false } : undefined,
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      this.client = null;
      throw this.mapError(error);
    }
  }

  /**
   * Check if a role name is a system role that should be excluded from lists.
   */
  private isSystemRole(rolname: string): boolean {
    return rolname.startsWith(SYSTEM_ROLE_PREFIX) || SYSTEM_ROLES.has(rolname);
  }

  /**
   * Map a pg_roles row to a DirectoryUser.
   */
  private rowToUser(row: Record<string, unknown>): DirectoryUser {
    return {
      id: row.rolname as string,
      username: row.rolname as string,
      active: true,
      metadata: {
        superuser: row.rolsuper as boolean,
        createDb: row.rolcreatedb as boolean,
        createRole: row.rolcreaterole as boolean,
      },
    };
  }

  /**
   * Map a pg_roles row to a DirectoryGroup.
   */
  private rowToGroup(row: Record<string, unknown>): DirectoryGroup {
    return {
      id: row.rolname as string,
      name: row.rolname as string,
      metadata: {
        superuser: row.rolsuper as boolean,
        createDb: row.rolcreatedb as boolean,
        createRole: row.rolcreaterole as boolean,
      },
    };
  }

  /**
   * Map a pg_roles row to a PgRole.
   */
  private rowToPgRole(row: Record<string, unknown>): PgRole {
    return {
      name: row.rolname as string,
      login: row.rolcanlogin as boolean,
      superuser: row.rolsuper as boolean,
      createDb: row.rolcreatedb as boolean,
      createRole: row.rolcreaterole as boolean,
    };
  }

  /**
   * Map a pg_database row to a PgDatabase.
   */
  private rowToDatabase(row: Record<string, unknown>): PgDatabase {
    return {
      name: row.datname as string,
      owner: row.owner as string,
      encoding: row.encoding as string | undefined,
      size: row.size as string | undefined,
    };
  }

  /**
   * Map PostgreSQL errors to directory error classes.
   */
  private mapError(error: unknown): DirectoryError {
    if (error instanceof DirectoryError) {
      return error;
    }

    const pgError = error as {
      code?: string;
      message?: string;
      routine?: string;
    };

    // PostgreSQL error codes
    switch (pgError.code) {
      case '42710': // duplicate_object
        return new ConflictError(
          'role',
          pgError.message ?? 'unknown',
          PROVIDER,
          error,
        );
      case '42704': // undefined_object
        return new NotFoundError(
          'role',
          pgError.message ?? 'unknown',
          PROVIDER,
          error,
        );
      case '28P01': // invalid_password
        return new AuthenticationError(
          pgError.message ?? 'Invalid password',
          PROVIDER,
          error,
        );
      default:
        break;
    }

    // Connection errors
    const message =
      pgError.message ??
      (error instanceof Error ? error.message : String(error));
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('connect ETIMEDOUT') ||
      message.includes('getaddrinfo')
    ) {
      return new ConnectionError(
        `Failed to connect to PostgreSQL: ${message}`,
        PROVIDER,
        error,
      );
    }

    return new DirectoryError(message, 'UNKNOWN_ERROR', PROVIDER, error);
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  // ==========================================================================
  // User CRUD (PostgreSQL roles WITH LOGIN)
  // ==========================================================================

  async createUser(input: CreateUserInput): Promise<DirectoryUser> {
    const client = await this.getClient();

    try {
      let sql = `CREATE ROLE ${this.escapeIdentifier(input.username)} WITH LOGIN`;

      if (input.password) {
        sql += ` PASSWORD ${this.escapeLiteral(input.password)}`;
      }

      await client.query(sql);

      return this.getUser(input.username);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getUser(id: string): Promise<DirectoryUser> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles
         WHERE rolname = $1 AND rolcanlogin = true`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('user', id, PROVIDER);
      }

      return this.rowToUser(result.rows[0]);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<DirectoryUser> {
    const client = await this.getClient();

    try {
      // Verify the user exists first
      await this.getUser(id);

      const alterClauses: string[] = [];

      if (input.password !== undefined) {
        alterClauses.push(`PASSWORD ${this.escapeLiteral(input.password)}`);
      }

      if (alterClauses.length > 0) {
        const sql = `ALTER ROLE ${this.escapeIdentifier(id)} WITH ${alterClauses.join(' ')}`;
        await client.query(sql);
      }

      return this.getUser(id);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async deleteUser(id: string): Promise<void> {
    const client = await this.getClient();

    try {
      await this.getUser(id);
      await client.query(`DROP ROLE ${this.escapeIdentifier(id)}`);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listUsers(): Promise<DirectoryUser[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles
         WHERE rolcanlogin = true
         ORDER BY rolname`,
      );

      return result.rows
        .filter(
          (row: Record<string, unknown>) =>
            !this.isSystemRole(row.rolname as string),
        )
        .map((row: Record<string, unknown>) => this.rowToUser(row));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ==========================================================================
  // Group CRUD (PostgreSQL roles WITHOUT LOGIN)
  // ==========================================================================

  async createGroup(input: CreateGroupInput): Promise<DirectoryGroup> {
    const client = await this.getClient();

    try {
      await client.query(
        `CREATE ROLE ${this.escapeIdentifier(input.name)} NOLOGIN`,
      );

      // Add initial members if provided
      if (input.members) {
        for (const member of input.members) {
          await this.addUserToGroup(member, input.name);
        }
      }

      return this.getGroup(input.name);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getGroup(id: string): Promise<DirectoryGroup> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles
         WHERE rolname = $1 AND rolcanlogin = false`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('group', id, PROVIDER);
      }

      return this.rowToGroup(result.rows[0]);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateGroup(
    id: string,
    _input: UpdateGroupInput,
  ): Promise<DirectoryGroup> {
    // PostgreSQL roles don't have display names or descriptions.
    // Verify the group exists and return it.
    return this.getGroup(id);
  }

  async deleteGroup(id: string): Promise<void> {
    const client = await this.getClient();

    try {
      await this.getGroup(id);
      await client.query(`DROP ROLE ${this.escapeIdentifier(id)}`);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listGroups(): Promise<DirectoryGroup[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles
         WHERE rolcanlogin = false
         ORDER BY rolname`,
      );

      return result.rows
        .filter(
          (row: Record<string, unknown>) =>
            !this.isSystemRole(row.rolname as string),
        )
        .map((row: Record<string, unknown>) => this.rowToGroup(row));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ==========================================================================
  // Membership (GRANT/REVOKE role TO/FROM role)
  // ==========================================================================

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `GRANT ${this.escapeIdentifier(groupId)} TO ${this.escapeIdentifier(userId)}`,
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `REVOKE ${this.escapeIdentifier(groupId)} FROM ${this.escapeIdentifier(userId)}`,
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getGroupMembers(groupId: string): Promise<DirectoryUser[]> {
    const client = await this.getClient();

    try {
      // Verify the group exists
      await this.getGroup(groupId);

      const result = await client.query(
        `SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolcanlogin
         FROM pg_auth_members m
         JOIN pg_roles g ON g.oid = m.roleid
         JOIN pg_roles r ON r.oid = m.member
         WHERE g.rolname = $1 AND r.rolcanlogin = true
         ORDER BY r.rolname`,
        [groupId],
      );

      return result.rows.map((row: Record<string, unknown>) =>
        this.rowToUser(row),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getUserGroups(userId: string): Promise<DirectoryGroup[]> {
    const client = await this.getClient();

    try {
      // Verify the user exists
      await this.getUser(userId);

      const result = await client.query(
        `SELECT g.rolname, g.rolsuper, g.rolcreatedb, g.rolcreaterole, g.rolcanlogin
         FROM pg_auth_members m
         JOIN pg_roles g ON g.oid = m.roleid
         JOIN pg_roles r ON r.oid = m.member
         WHERE r.rolname = $1 AND g.rolcanlogin = false
         ORDER BY g.rolname`,
        [userId],
      );

      return result.rows.map((row: Record<string, unknown>) =>
        this.rowToGroup(row),
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ==========================================================================
  // Database Provisioning
  // ==========================================================================

  async createDatabase(input: CreatePgDatabaseInput): Promise<PgDatabase> {
    const client = await this.getClient();

    try {
      let sql = `CREATE DATABASE ${this.escapeIdentifier(input.name)} OWNER ${this.escapeIdentifier(input.owner)}`;

      if (input.encoding) {
        sql += ` ENCODING ${this.escapeLiteral(input.encoding)}`;
      }

      await client.query(sql);

      return this.getDatabase(input.name);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getDatabase(name: string): Promise<PgDatabase> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT
           d.datname,
           pg_catalog.pg_get_userbyid(d.datdba) AS owner,
           pg_encoding_to_char(d.encoding) AS encoding,
           pg_database_size(d.datname)::text AS size
         FROM pg_database d
         WHERE d.datname = $1`,
        [name],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('database', name, PROVIDER);
      }

      return this.rowToDatabase(result.rows[0]);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async dropDatabase(name: string): Promise<void> {
    const client = await this.getClient();

    try {
      await this.getDatabase(name);
      await client.query(`DROP DATABASE ${this.escapeIdentifier(name)}`);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listDatabases(): Promise<PgDatabase[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT
           d.datname,
           pg_catalog.pg_get_userbyid(d.datdba) AS owner,
           pg_encoding_to_char(d.encoding) AS encoding,
           pg_database_size(d.datname)::text AS size
         FROM pg_database d
         ORDER BY d.datname`,
      );

      return result.rows
        .filter(
          (row: Record<string, unknown>) =>
            !SYSTEM_DATABASES.has(row.datname as string),
        )
        .map((row: Record<string, unknown>) => this.rowToDatabase(row));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ==========================================================================
  // Role Provisioning
  // ==========================================================================

  async createRole(input: CreatePgRoleInput): Promise<PgRole> {
    const client = await this.getClient();

    try {
      const options: string[] = [];

      if (input.login !== undefined) {
        options.push(input.login ? 'LOGIN' : 'NOLOGIN');
      }

      if (input.password) {
        options.push(`PASSWORD ${this.escapeLiteral(input.password)}`);
      }

      if (input.superuser !== undefined) {
        options.push(input.superuser ? 'SUPERUSER' : 'NOSUPERUSER');
      }

      if (input.createDb !== undefined) {
        options.push(input.createDb ? 'CREATEDB' : 'NOCREATEDB');
      }

      if (input.createRole !== undefined) {
        options.push(input.createRole ? 'CREATEROLE' : 'NOCREATEROLE');
      }

      let sql = `CREATE ROLE ${this.escapeIdentifier(input.name)}`;
      if (options.length > 0) {
        sql += ` WITH ${options.join(' ')}`;
      }

      await client.query(sql);

      return this.getRole(input.name);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getRole(name: string): Promise<PgRole> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
         FROM pg_roles
         WHERE rolname = $1`,
        [name],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('role', name, PROVIDER);
      }

      return this.rowToPgRole(result.rows[0]);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async dropRole(name: string): Promise<void> {
    const client = await this.getClient();

    try {
      await this.getRole(name);
      await client.query(`DROP ROLE ${this.escapeIdentifier(name)}`);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async listRoles(): Promise<PgRole[]> {
    const client = await this.getClient();

    try {
      const result = await client.query(
        `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
         FROM pg_roles
         ORDER BY rolname`,
      );

      return result.rows
        .filter(
          (row: Record<string, unknown>) =>
            !this.isSystemRole(row.rolname as string),
        )
        .map((row: Record<string, unknown>) => this.rowToPgRole(row));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // ==========================================================================
  // Access Control (GRANT/REVOKE on databases)
  // ==========================================================================

  async grantAccess(roleName: string, databaseName: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `GRANT ALL ON DATABASE ${this.escapeIdentifier(databaseName)} TO ${this.escapeIdentifier(roleName)}`,
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async revokeAccess(roleName: string, databaseName: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client.query(
        `REVOKE ALL ON DATABASE ${this.escapeIdentifier(databaseName)} FROM ${this.escapeIdentifier(roleName)}`,
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }
}
