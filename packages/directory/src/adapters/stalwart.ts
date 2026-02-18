/**
 * Stalwart mail server directory adapter
 *
 * Implements StalwartDirectoryAdapter using the Stalwart REST API
 * with HTTP Basic authentication. Manages users, groups, domains,
 * DKIM keys, DNS records, and mailboxes via the principals API.
 */

import {
  AuthenticationError,
  ConflictError,
  ConnectionError,
  DirectoryError,
  NotFoundError,
} from '../shared/errors.js';
import type {
  CreateDkimKeyInput,
  CreateGroupInput,
  CreateMailboxInput,
  CreateMailDomainInput,
  CreateUserInput,
  DirectoryGroup,
  DirectoryUser,
  DkimKey,
  DnsRecord,
  Mailbox,
  MailDomain,
  StalwartDirectoryAdapter,
  StalwartOptions,
  UpdateGroupInput,
  UpdateMailboxInput,
  UpdateUserInput,
} from '../shared/types.js';

const PROVIDER = 'stalwart';
const DEFAULT_TIMEOUT = 30_000;

/** Stalwart principal as returned by the API */
interface StalwartPrincipal {
  name: string;
  type: 'individual' | 'group' | 'domain';
  description?: string;
  emails?: string[];
  memberOf?: string[];
  members?: string[];
  quota?: number;
  secrets?: string[];
  [key: string]: unknown;
}

export class StalwartAdapter implements StalwartDirectoryAdapter {
  private readonly options: StalwartOptions;
  private readonly authHeader: string;

  constructor(options: StalwartOptions) {
    this.options = options;
    this.authHeader = `Basic ${btoa(`${options.username}:${options.password}`)}`;
  }

  private get timeout(): number {
    return this.options.timeout ?? DEFAULT_TIMEOUT;
  }

  // ==========================================================================
  // HTTP Helper
  // ==========================================================================

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.options.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ConnectionError(
          `Request timed out after ${this.timeout}ms: ${method} ${path}`,
          PROVIDER,
          error,
        );
      }
      throw new ConnectionError(
        `Failed to connect to Stalwart: ${(error as Error).message}`,
        PROVIDER,
        error,
      );
    }

    if (response.ok) {
      const text = await response.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }

    const errorBody = await response.text().catch(() => '');

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthenticationError(
          `Authentication failed: ${response.status} ${response.statusText}`,
          PROVIDER,
        );
      case 404:
        throw new NotFoundError('resource', path, PROVIDER);
      case 409:
        throw new ConflictError('resource', path, PROVIDER);
      default:
        throw new DirectoryError(
          `Stalwart API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
          'API_ERROR',
          PROVIDER,
        );
    }
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/api/principal?type=individual&limit=1');
      return true;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // HTTP adapter - no persistent connection to close
  }

  // ==========================================================================
  // User CRUD
  // ==========================================================================

  async createUser(input: CreateUserInput): Promise<DirectoryUser> {
    const principal: StalwartPrincipal = {
      name: input.username,
      type: 'individual',
      description: input.displayName,
      emails: input.email ? [input.email] : [],
      secrets: input.password ? [input.password] : undefined,
    };

    await this.request('POST', '/api/principal', principal);
    return this.getUser(input.username);
  }

  async getUser(id: string): Promise<DirectoryUser> {
    const principal = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(id)}`,
    );
    return this.principalToUser(principal);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<DirectoryUser> {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.description = input.displayName;
    if (input.email !== undefined) patch.emails = [input.email];
    if (input.password !== undefined) patch.secrets = [input.password];

    await this.request(
      'PATCH',
      `/api/principal/${encodeURIComponent(id)}`,
      patch,
    );
    return this.getUser(id);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request('DELETE', `/api/principal/${encodeURIComponent(id)}`);
  }

  async listUsers(): Promise<DirectoryUser[]> {
    const names = await this.request<string[]>(
      'GET',
      '/api/principal?type=individual',
    );
    const users = await Promise.all(
      (names ?? []).map((name) => this.getUser(name)),
    );
    return users;
  }

  // ==========================================================================
  // Group CRUD
  // ==========================================================================

  async createGroup(input: CreateGroupInput): Promise<DirectoryGroup> {
    const principal: StalwartPrincipal = {
      name: input.name,
      type: 'group',
      description: input.description ?? input.displayName,
      members: input.members,
    };

    await this.request('POST', '/api/principal', principal);
    return this.getGroup(input.name);
  }

  async getGroup(id: string): Promise<DirectoryGroup> {
    const principal = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(id)}`,
    );
    return this.principalToGroup(principal);
  }

  async updateGroup(
    id: string,
    input: UpdateGroupInput,
  ): Promise<DirectoryGroup> {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.description = input.displayName;
    if (input.description !== undefined) patch.description = input.description;

    await this.request(
      'PATCH',
      `/api/principal/${encodeURIComponent(id)}`,
      patch,
    );
    return this.getGroup(id);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.request('DELETE', `/api/principal/${encodeURIComponent(id)}`);
  }

  async listGroups(): Promise<DirectoryGroup[]> {
    const names = await this.request<string[]>(
      'GET',
      '/api/principal?type=group',
    );
    const groups = await Promise.all(
      (names ?? []).map((name) => this.getGroup(name)),
    );
    return groups;
  }

  // ==========================================================================
  // Membership
  // ==========================================================================

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(groupId)}`,
    );
    const members = group.members ?? [];
    if (!members.includes(userId)) {
      members.push(userId);
    }
    await this.request(
      'PATCH',
      `/api/principal/${encodeURIComponent(groupId)}`,
      { members },
    );
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(groupId)}`,
    );
    const members = (group.members ?? []).filter((m) => m !== userId);
    await this.request(
      'PATCH',
      `/api/principal/${encodeURIComponent(groupId)}`,
      { members },
    );
  }

  async getGroupMembers(groupId: string): Promise<DirectoryUser[]> {
    const group = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(groupId)}`,
    );
    const members = group.members ?? [];
    const users = await Promise.all(members.map((name) => this.getUser(name)));
    return users;
  }

  async getUserGroups(userId: string): Promise<DirectoryGroup[]> {
    const user = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(userId)}`,
    );
    const groupNames = user.memberOf ?? [];
    const groups = await Promise.all(
      groupNames.map((name) => this.getGroup(name)),
    );
    return groups;
  }

  // ==========================================================================
  // Domain CRUD
  // ==========================================================================

  async createDomain(input: CreateMailDomainInput): Promise<MailDomain> {
    const principal: StalwartPrincipal = {
      name: input.name,
      type: 'domain',
    };

    await this.request('POST', '/api/principal', principal);
    return this.getDomain(input.name);
  }

  async getDomain(id: string): Promise<MailDomain> {
    const principal = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(id)}`,
    );
    return {
      id: principal.name,
      name: principal.name,
      active: true,
    };
  }

  async deleteDomain(id: string): Promise<void> {
    await this.request('DELETE', `/api/principal/${encodeURIComponent(id)}`);
  }

  async listDomains(): Promise<MailDomain[]> {
    const names = await this.request<string[]>(
      'GET',
      '/api/principal?type=domain',
    );
    const domains = await Promise.all(
      (names ?? []).map((name) => this.getDomain(name)),
    );
    return domains;
  }

  // ==========================================================================
  // DKIM
  // ==========================================================================

  async createDkimKey(input: CreateDkimKeyInput): Promise<DkimKey> {
    const result = await this.request<{
      id?: string;
      publicKey?: string;
    }>('POST', '/api/dkim', {
      domain: input.domain,
      selector: input.selector,
    });

    return {
      id: result?.id ?? `${input.selector}._domainkey.${input.domain}`,
      domain: input.domain,
      selector: input.selector,
      publicKey: result?.publicKey,
    };
  }

  // ==========================================================================
  // DNS Records
  // ==========================================================================

  async getDnsRecords(domain: string): Promise<DnsRecord[]> {
    const records = await this.request<DnsRecord[]>(
      'GET',
      `/api/dns/records/${encodeURIComponent(domain)}`,
    );
    return records ?? [];
  }

  // ==========================================================================
  // Mailbox CRUD
  // ==========================================================================

  async createMailbox(input: CreateMailboxInput): Promise<Mailbox> {
    const atIndex = input.email.indexOf('@');
    const localPart =
      atIndex >= 0 ? input.email.slice(0, atIndex) : input.email;
    const principal: StalwartPrincipal = {
      name: localPart,
      type: 'individual',
      description: input.name,
      emails: [input.email],
      secrets: [input.password],
      quota: input.quota,
    };

    await this.request('POST', '/api/principal', principal);
    return this.getMailbox(localPart);
  }

  async getMailbox(id: string): Promise<Mailbox> {
    const principal = await this.request<StalwartPrincipal>(
      'GET',
      `/api/principal/${encodeURIComponent(id)}`,
    );
    return this.principalToMailbox(principal);
  }

  async updateMailbox(id: string, input: UpdateMailboxInput): Promise<Mailbox> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.description = input.name;
    if (input.password !== undefined) patch.secrets = [input.password];
    if (input.quota !== undefined) patch.quota = input.quota;

    await this.request(
      'PATCH',
      `/api/principal/${encodeURIComponent(id)}`,
      patch,
    );
    return this.getMailbox(id);
  }

  async deleteMailbox(id: string): Promise<void> {
    await this.request('DELETE', `/api/principal/${encodeURIComponent(id)}`);
  }

  async listMailboxes(): Promise<Mailbox[]> {
    const names = await this.request<string[]>(
      'GET',
      '/api/principal?type=individual',
    );
    const mailboxes = await Promise.all(
      (names ?? []).map((name) => this.getMailbox(name)),
    );
    return mailboxes;
  }

  // ==========================================================================
  // Principal Mapping Helpers
  // ==========================================================================

  private principalToUser(principal: StalwartPrincipal): DirectoryUser {
    return {
      id: principal.name,
      username: principal.name,
      displayName: principal.description,
      email: principal.emails?.[0],
      active: true,
      groups: principal.memberOf,
    };
  }

  private principalToGroup(principal: StalwartPrincipal): DirectoryGroup {
    return {
      id: principal.name,
      name: principal.name,
      displayName: principal.description,
      description: principal.description,
      members: principal.members,
    };
  }

  private principalToMailbox(principal: StalwartPrincipal): Mailbox {
    return {
      id: principal.name,
      name: principal.description ?? principal.name,
      email: principal.emails?.[0] ?? '',
      quota: principal.quota,
      active: true,
    };
  }
}
