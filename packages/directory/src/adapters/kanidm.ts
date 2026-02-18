/**
 * Kanidm directory adapter
 *
 * Implements KanidmDirectoryAdapter using the Kanidm REST API v1.
 * Provides user/group CRUD, membership management, and OAuth2 client operations.
 * Uses native fetch with AbortSignal.timeout() for all HTTP requests.
 */

import {
  AuthenticationError,
  ConflictError,
  ConnectionError,
  DirectoryError,
  NotFoundError,
} from '../shared/errors.js';
import type {
  CreateGroupInput,
  CreateOAuth2ClientInput,
  CreateUserInput,
  DirectoryGroup,
  DirectoryUser,
  KanidmDirectoryAdapter,
  KanidmOptions,
  OAuth2Client,
  UpdateGroupInput,
  UpdateOAuth2ClientInput,
  UpdateUserInput,
} from '../shared/types.js';

// ============================================================================
// Kanidm Response Types
// ============================================================================

interface KanidmAttrs {
  attrs: Record<string, string[]>;
}

interface KanidmAuthResult {
  state?: { success?: string };
  token?: string;
}

// ============================================================================
// Adapter Implementation
// ============================================================================

export class KanidmAdapter implements KanidmDirectoryAdapter {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private adminToken: string | null = null;
  private adminTokenExpiry = 0;

  constructor(private readonly options: KanidmOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeout = options.timeout ?? 30_000;
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  private async getAdminToken(): Promise<string> {
    if (this.adminToken && Date.now() < this.adminTokenExpiry) {
      return this.adminToken;
    }

    const authUrl = `${this.baseUrl}/v1/auth`;

    // Step 1: Initialize auth
    const initResponse = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: {
          init2: {
            username: this.options.adminUsername,
            issue: 'token',
            privileged: true,
          },
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!initResponse.ok) {
      throw new AuthenticationError(
        'Failed to initialize admin authentication',
        'kanidm',
      );
    }

    const cookies = initResponse.headers.get('set-cookie');

    // Step 2: Begin password authentication
    const beginResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify({ step: { begin: 'password' } }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!beginResponse.ok) {
      throw new AuthenticationError(
        'Failed to begin password authentication',
        'kanidm',
      );
    }

    // Step 3: Provide password
    const credResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify({
        step: { cred: { password: this.options.adminPassword } },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!credResponse.ok) {
      throw new AuthenticationError('Invalid admin credentials', 'kanidm');
    }

    const result = (await credResponse.json()) as KanidmAuthResult;
    const token = result.state?.success || result.token;

    if (!token) {
      throw new AuthenticationError('Failed to obtain admin token', 'kanidm');
    }

    this.adminToken = token;
    this.adminTokenExpiry = Date.now() + 3_600_000; // 1 hour

    return this.adminToken;
  }

  // ==========================================================================
  // HTTP Helper
  // ==========================================================================

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ConnectionError(
          `Failed to connect to Kanidm at ${this.baseUrl}`,
          'kanidm',
          error,
        );
      }
      throw error;
    }

    if (response.ok) {
      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }

    // Map HTTP status codes to error types
    const errorBody = await response.text().catch(() => '');

    switch (response.status) {
      case 401:
      case 403:
        // Invalidate cached token on auth failure
        this.adminToken = null;
        this.adminTokenExpiry = 0;
        throw new AuthenticationError(
          errorBody || `Authentication failed: ${response.status}`,
          'kanidm',
        );
      case 404:
        throw new NotFoundError('resource', path, 'kanidm');
      case 409:
        throw new ConflictError('resource', path, 'kanidm');
      default:
        throw new DirectoryError(
          errorBody ||
            `Request failed: ${response.status} ${response.statusText}`,
          'REQUEST_ERROR',
          'kanidm',
        );
    }
  }

  // ==========================================================================
  // Mapping Helpers
  // ==========================================================================

  private mapPersonToUser(data: KanidmAttrs): DirectoryUser {
    const attrs = data.attrs;
    return {
      id: this.attrFirst(attrs, 'uuid') ?? this.attrFirst(attrs, 'name') ?? '',
      username: this.attrFirst(attrs, 'name') ?? '',
      displayName: this.attrFirst(attrs, 'displayname'),
      email: this.attrFirst(attrs, 'mail'),
      active: this.attrFirst(attrs, 'class')
        ? !attrs.class?.includes('recycled')
        : true,
      groups: attrs.memberof,
      metadata: { attrs },
    };
  }

  private mapGroupToDirectoryGroup(data: KanidmAttrs): DirectoryGroup {
    const attrs = data.attrs;
    return {
      id: this.attrFirst(attrs, 'uuid') ?? this.attrFirst(attrs, 'name') ?? '',
      name: this.attrFirst(attrs, 'name') ?? '',
      displayName: this.attrFirst(attrs, 'displayname'),
      description: this.attrFirst(attrs, 'description'),
      members: attrs.member,
      metadata: { attrs },
    };
  }

  private mapOAuth2Client(data: KanidmAttrs): OAuth2Client {
    const attrs = data.attrs;
    return {
      id:
        this.attrFirst(attrs, 'uuid') ??
        this.attrFirst(attrs, 'oauth2_rs_name') ??
        '',
      name: this.attrFirst(attrs, 'oauth2_rs_name') ?? '',
      displayName: this.attrFirst(attrs, 'displayname'),
      redirectUris: attrs.oauth2_rs_origin ?? [],
      scopes: attrs.oauth2_rs_scope_map ? attrs.oauth2_rs_scope_map : undefined,
      metadata: { attrs },
    };
  }

  private attrFirst(
    attrs: Record<string, string[]>,
    key: string,
  ): string | undefined {
    const values = attrs[key];
    return values?.[0];
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  async testConnection(): Promise<boolean> {
    try {
      await this.getAdminToken();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.adminToken = null;
    this.adminTokenExpiry = 0;
  }

  // ==========================================================================
  // User CRUD
  // ==========================================================================

  async createUser(input: CreateUserInput): Promise<DirectoryUser> {
    const body: Record<string, unknown> = {
      attrs: {
        name: [input.username],
        ...(input.displayName ? { displayname: [input.displayName] } : {}),
        ...(input.email ? { mail: [input.email] } : {}),
        ...(input.metadata ?? {}),
      },
    };

    await this.request('POST', '/v1/person', body);
    return this.getUser(input.username);
  }

  async getUser(id: string): Promise<DirectoryUser> {
    const data = await this.request<KanidmAttrs>(
      'GET',
      `/v1/person/${encodeURIComponent(id)}`,
    );
    return this.mapPersonToUser(data);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<DirectoryUser> {
    const attrs: Record<string, string[]> = {};

    if (input.displayName !== undefined) {
      attrs.displayname = [input.displayName];
    }
    if (input.email !== undefined) {
      attrs.mail = [input.email];
    }

    await this.request('PATCH', `/v1/person/${encodeURIComponent(id)}`, {
      attrs,
    });

    return this.getUser(id);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request('DELETE', `/v1/person/${encodeURIComponent(id)}`);
  }

  async listUsers(): Promise<DirectoryUser[]> {
    const data = await this.request<KanidmAttrs[]>('GET', '/v1/person');
    return (data ?? []).map((entry) => this.mapPersonToUser(entry));
  }

  // ==========================================================================
  // Group CRUD
  // ==========================================================================

  async createGroup(input: CreateGroupInput): Promise<DirectoryGroup> {
    const body: Record<string, unknown> = {
      attrs: {
        name: [input.name],
        ...(input.displayName ? { displayname: [input.displayName] } : {}),
        ...(input.description ? { description: [input.description] } : {}),
        ...(input.members ? { member: input.members } : {}),
        ...(input.metadata ?? {}),
      },
    };

    await this.request('POST', '/v1/group', body);
    return this.getGroup(input.name);
  }

  async getGroup(id: string): Promise<DirectoryGroup> {
    const data = await this.request<KanidmAttrs>(
      'GET',
      `/v1/group/${encodeURIComponent(id)}`,
    );
    return this.mapGroupToDirectoryGroup(data);
  }

  async updateGroup(
    id: string,
    input: UpdateGroupInput,
  ): Promise<DirectoryGroup> {
    const attrs: Record<string, string[]> = {};

    if (input.displayName !== undefined) {
      attrs.displayname = [input.displayName];
    }
    if (input.description !== undefined) {
      attrs.description = [input.description];
    }

    await this.request('PATCH', `/v1/group/${encodeURIComponent(id)}`, {
      attrs,
    });

    return this.getGroup(id);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.request('DELETE', `/v1/group/${encodeURIComponent(id)}`);
  }

  async listGroups(): Promise<DirectoryGroup[]> {
    const data = await this.request<KanidmAttrs[]>('GET', '/v1/group');
    return (data ?? []).map((entry) => this.mapGroupToDirectoryGroup(entry));
  }

  // ==========================================================================
  // Membership
  // ==========================================================================

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    await this.request(
      'POST',
      `/v1/group/${encodeURIComponent(groupId)}/_attr/member`,
      [userId],
    );
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/group/${encodeURIComponent(groupId)}/_attr/member`,
      [userId],
    );
  }

  async getGroupMembers(groupId: string): Promise<DirectoryUser[]> {
    const group = await this.getGroup(groupId);
    if (!group.members || group.members.length === 0) {
      return [];
    }

    const users: DirectoryUser[] = [];
    for (const memberId of group.members) {
      try {
        const user = await this.getUser(memberId);
        users.push(user);
      } catch (error) {
        // Skip members that are not persons (e.g., nested groups)
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
    }

    return users;
  }

  async getUserGroups(userId: string): Promise<DirectoryGroup[]> {
    const user = await this.getUser(userId);
    if (!user.groups || user.groups.length === 0) {
      return [];
    }

    const groups: DirectoryGroup[] = [];
    for (const groupId of user.groups) {
      try {
        const group = await this.getGroup(groupId);
        groups.push(group);
      } catch (error) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
      }
    }

    return groups;
  }

  // ==========================================================================
  // OAuth2 Client CRUD
  // ==========================================================================

  async createOAuth2Client(
    input: CreateOAuth2ClientInput,
  ): Promise<OAuth2Client> {
    const body: Record<string, unknown> = {
      attrs: {
        oauth2_rs_name: [input.name],
        ...(input.displayName ? { displayname: [input.displayName] } : {}),
        oauth2_rs_origin: input.redirectUris,
        ...(input.scopes ? { oauth2_rs_scope_map: input.scopes } : {}),
      },
    };

    await this.request('POST', '/v1/oauth2', body);
    return this.getOAuth2Client(input.name);
  }

  async getOAuth2Client(id: string): Promise<OAuth2Client> {
    const data = await this.request<KanidmAttrs>(
      'GET',
      `/v1/oauth2/${encodeURIComponent(id)}`,
    );
    return this.mapOAuth2Client(data);
  }

  async updateOAuth2Client(
    id: string,
    input: UpdateOAuth2ClientInput,
  ): Promise<OAuth2Client> {
    const attrs: Record<string, string[]> = {};

    if (input.displayName !== undefined) {
      attrs.displayname = [input.displayName];
    }
    if (input.redirectUris !== undefined) {
      attrs.oauth2_rs_origin = input.redirectUris;
    }
    if (input.scopes !== undefined) {
      attrs.oauth2_rs_scope_map = input.scopes;
    }

    await this.request('PATCH', `/v1/oauth2/${encodeURIComponent(id)}`, {
      attrs,
    });

    return this.getOAuth2Client(id);
  }

  async deleteOAuth2Client(id: string): Promise<void> {
    await this.request('DELETE', `/v1/oauth2/${encodeURIComponent(id)}`);
  }

  async listOAuth2Clients(): Promise<OAuth2Client[]> {
    const data = await this.request<KanidmAttrs[]>('GET', '/v1/oauth2');
    return (data ?? []).map((entry) => this.mapOAuth2Client(entry));
  }

  // ==========================================================================
  // OAuth2 Secret Management
  // ==========================================================================

  async getOAuth2ClientSecret(id: string): Promise<string> {
    const data = await this.request<string>(
      'GET',
      `/v1/oauth2/${encodeURIComponent(id)}/_basic_secret`,
    );
    return data;
  }
}
