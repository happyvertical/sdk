/**
 * Core types for @happyvertical/directory package
 *
 * SCIM-aligned directory types for identity, mail, database, and cloud provisioning.
 * Interfaces are named for the service (Kanidm, Stalwart, Postgres, AWS) because
 * we may have multiple services of the same function.
 */

// ============================================================================
// Core Directory Types (SCIM-aligned)
// ============================================================================

export interface DirectoryUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  active?: boolean;
  groups?: string[];
  metadata?: Record<string, unknown>;
}

export interface DirectoryGroup {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  members?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string;
  password?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string;
  password?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateGroupInput {
  name: string;
  displayName?: string;
  description?: string;
  members?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateGroupInput {
  displayName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Base DirectoryAdapter Interface
// ============================================================================

export interface DirectoryAdapter {
  // Connection
  testConnection(): Promise<boolean>;
  disconnect(): Promise<void>;

  // User CRUD
  createUser(input: CreateUserInput): Promise<DirectoryUser>;
  getUser(id: string): Promise<DirectoryUser>;
  updateUser(id: string, input: UpdateUserInput): Promise<DirectoryUser>;
  deleteUser(id: string): Promise<void>;
  listUsers(): Promise<DirectoryUser[]>;

  // Group CRUD
  createGroup(input: CreateGroupInput): Promise<DirectoryGroup>;
  getGroup(id: string): Promise<DirectoryGroup>;
  updateGroup(id: string, input: UpdateGroupInput): Promise<DirectoryGroup>;
  deleteGroup(id: string): Promise<void>;
  listGroups(): Promise<DirectoryGroup[]>;

  // Membership
  addUserToGroup(userId: string, groupId: string): Promise<void>;
  removeUserFromGroup(userId: string, groupId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<DirectoryUser[]>;
  getUserGroups(userId: string): Promise<DirectoryGroup[]>;
}

// ============================================================================
// Kanidm-Specific Types
// ============================================================================

export interface OAuth2Client {
  id: string;
  name: string;
  displayName?: string;
  redirectUris: string[];
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateOAuth2ClientInput {
  name: string;
  displayName?: string;
  redirectUris: string[];
  scopes?: string[];
}

export interface UpdateOAuth2ClientInput {
  displayName?: string;
  redirectUris?: string[];
  scopes?: string[];
}

export interface KanidmDirectoryAdapter extends DirectoryAdapter {
  // OAuth2 Client CRUD
  createOAuth2Client(input: CreateOAuth2ClientInput): Promise<OAuth2Client>;
  getOAuth2Client(id: string): Promise<OAuth2Client>;
  updateOAuth2Client(
    id: string,
    input: UpdateOAuth2ClientInput,
  ): Promise<OAuth2Client>;
  deleteOAuth2Client(id: string): Promise<void>;
  listOAuth2Clients(): Promise<OAuth2Client[]>;

  // Secret management
  getOAuth2ClientSecret(id: string): Promise<string>;

  // Credential management
  createCredentialResetIntent(
    userId: string,
    options?: { ttl?: number },
  ): Promise<CredentialResetIntent>;
}

// ============================================================================
// Stalwart-Specific Types
// ============================================================================

export interface MailDomain {
  id: string;
  name: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateMailDomainInput {
  name: string;
}

export interface DkimKey {
  id: string;
  domain: string;
  selector: string;
  publicKey?: string;
}

export interface CreateDkimKeyInput {
  domain: string;
  selector: string;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
}

export interface Mailbox {
  id: string;
  name: string;
  email: string;
  quota?: number;
  active?: boolean;
}

export interface CreateMailboxInput {
  name: string;
  email: string;
  password: string;
  quota?: number;
}

export interface UpdateMailboxInput {
  name?: string;
  password?: string;
  quota?: number;
  active?: boolean;
}

export interface StalwartDirectoryAdapter extends DirectoryAdapter {
  // Domain CRUD
  createDomain(input: CreateMailDomainInput): Promise<MailDomain>;
  getDomain(id: string): Promise<MailDomain>;
  deleteDomain(id: string): Promise<void>;
  listDomains(): Promise<MailDomain[]>;

  // DKIM
  createDkimKey(input: CreateDkimKeyInput): Promise<DkimKey>;
  getDnsRecords(domain: string): Promise<DnsRecord[]>;

  // Mailbox CRUD
  createMailbox(input: CreateMailboxInput): Promise<Mailbox>;
  getMailbox(id: string): Promise<Mailbox>;
  updateMailbox(id: string, input: UpdateMailboxInput): Promise<Mailbox>;
  deleteMailbox(id: string): Promise<void>;
  listMailboxes(): Promise<Mailbox[]>;
}

// ============================================================================
// PostgreSQL-Specific Types
// ============================================================================

export interface PgDatabase {
  name: string;
  owner: string;
  encoding?: string;
  size?: string;
}

export interface CreatePgDatabaseInput {
  name: string;
  owner: string;
  encoding?: string;
}

export interface PgRole {
  name: string;
  login?: boolean;
  superuser?: boolean;
  createDb?: boolean;
  createRole?: boolean;
}

export interface CreatePgRoleInput {
  name: string;
  password: string;
  login?: boolean;
  superuser?: boolean;
  createDb?: boolean;
  createRole?: boolean;
}

export interface PostgresDirectoryAdapter extends DirectoryAdapter {
  // Database provisioning
  createDatabase(input: CreatePgDatabaseInput): Promise<PgDatabase>;
  getDatabase(name: string): Promise<PgDatabase>;
  dropDatabase(name: string): Promise<void>;
  listDatabases(): Promise<PgDatabase[]>;

  // Role provisioning
  createRole(input: CreatePgRoleInput): Promise<PgRole>;
  getRole(name: string): Promise<PgRole>;
  dropRole(name: string): Promise<void>;
  listRoles(): Promise<PgRole[]>;

  // Access control
  grantAccess(roleName: string, databaseName: string): Promise<void>;
  revokeAccess(roleName: string, databaseName: string): Promise<void>;
}

// ============================================================================
// AWS-Specific Types
// ============================================================================

export interface AwsOrganizationalUnit {
  id: string;
  name: string;
  arn?: string;
  parentId?: string;
}

export interface CreateAwsOuInput {
  name: string;
  parentId: string;
}

export interface AwsAccount {
  id: string;
  name: string;
  email: string;
  arn?: string;
  status?: string;
}

export interface CreateAwsAccountInput {
  name: string;
  email: string;
  roleName?: string;
}

export interface AwsAccountCreationStatus {
  id: string;
  accountId?: string;
  state: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  failureReason?: string;
}

export interface AwsIamUser {
  username: string;
  arn?: string;
  userId?: string;
  createDate?: Date;
}

export interface CreateAwsIamUserInput {
  username: string;
  path?: string;
}

export interface AwsAccessKey {
  accessKeyId: string;
  secretAccessKey: string;
  username: string;
  createDate?: Date;
}

export interface AwsDirectoryAdapter extends DirectoryAdapter {
  // Organizational Units
  createOrganizationalUnit(
    input: CreateAwsOuInput,
  ): Promise<AwsOrganizationalUnit>;
  getOrganizationalUnit(id: string): Promise<AwsOrganizationalUnit>;
  listOrganizationalUnits(parentId: string): Promise<AwsOrganizationalUnit[]>;

  // Accounts
  createAccount(
    input: CreateAwsAccountInput,
  ): Promise<AwsAccountCreationStatus>;
  getAccountCreationStatus(id: string): Promise<AwsAccountCreationStatus>;
  listAccounts(): Promise<AwsAccount[]>;
  moveAccount(
    accountId: string,
    sourceParentId: string,
    destParentId: string,
  ): Promise<void>;

  // IAM Users
  createIamUser(input: CreateAwsIamUserInput): Promise<AwsIamUser>;
  getIamUser(username: string): Promise<AwsIamUser>;
  deleteIamUser(username: string): Promise<void>;
  listIamUsers(): Promise<AwsIamUser[]>;

  // IAM Policies
  attachUserPolicy(username: string, policyArn: string): Promise<void>;
  detachUserPolicy(username: string, policyArn: string): Promise<void>;

  // Access Keys
  createAccessKey(username: string): Promise<AwsAccessKey>;
  deleteAccessKey(username: string, accessKeyId: string): Promise<void>;
}

// ============================================================================
// Orchestrator Interface (Phase 5 — interface only)
// ============================================================================

export interface TenantProvisioningInput {
  tenantId: string;
  tenantName: string;
  adminEmail: string;
  services: DirectoryAdapterType[];
}

export interface TenantProvisioningResult {
  tenantId: string;
  results: Record<
    string,
    { success: boolean; error?: string; metadata?: Record<string, unknown> }
  >;
}

export interface DirectoryOrchestrator {
  provisionTenant(
    input: TenantProvisioningInput,
  ): Promise<TenantProvisioningResult>;
  deprovisionTenant(tenantId: string): Promise<TenantProvisioningResult>;
}

// ============================================================================
// Adapter Configuration (Discriminated Union)
// ============================================================================

export type DirectoryAdapterType = 'kanidm' | 'stalwart' | 'postgres' | 'aws';

export interface CredentialResetIntent {
  token: string;
  url: string;
  ttl: number;
}

export interface KanidmOptions {
  type: 'kanidm';
  baseUrl: string;
  adminUsername?: string;
  adminPassword?: string;
  apiToken?: string;
  timeout?: number;
}

export interface StalwartOptions {
  type: 'stalwart';
  baseUrl: string;
  username: string;
  password: string;
  timeout?: number;
}

export interface PostgresOptions {
  type: 'postgres';
  host: string;
  port?: number;
  adminUser: string;
  adminPassword: string;
  database?: string;
  ssl?: boolean | Record<string, unknown>;
}

export interface AwsOptions {
  type: 'aws';
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export type GetDirectoryAdapterOptions =
  | KanidmOptions
  | StalwartOptions
  | PostgresOptions
  | AwsOptions;
