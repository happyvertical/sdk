/**
 * @happyvertical/directory
 *
 * Unified directory services with adapter-based architecture.
 * Supports Kanidm (identity), Stalwart (mail), PostgreSQL (database), and AWS (cloud).
 */

// Adapters (for direct instantiation)
export { AwsAdapter } from './adapters/aws.js';
export { KanidmAdapter } from './adapters/kanidm.js';
export { PostgresAdapter } from './adapters/postgres.js';
export { StalwartAdapter } from './adapters/stalwart.js';

// Error classes
export {
  AuthenticationError,
  ConflictError,
  ConnectionError,
  DirectoryError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './shared/errors.js';

// Factory functions + type guards
export {
  getAwsAdapter,
  getDirectoryAdapter,
  getKanidmAdapter,
  getPostgresAdapter,
  getStalwartAdapter,
  isAwsOptions,
  isKanidmOptions,
  isPostgresOptions,
  isStalwartOptions,
} from './shared/factory.js';

// Types
export type {
  AwsAccessKey,
  AwsAccount,
  AwsAccountCreationStatus,
  AwsAccountCreationWaitOptions,
  AwsAccountParent,
  AwsAssumeRoleInput,
  AwsDirectoryAdapter,
  AwsIamRole,
  AwsIamUser,
  AwsOptions,
  AwsOrganizationalUnit,
  AwsTemporaryCredentials,
  CreateAwsAccountInput,
  CreateAwsIamUserInput,
  CreateAwsOuInput,
  CreateDkimKeyInput,
  CreateGroupInput,
  CreateMailboxInput,
  CreateMailDomainInput,
  CreateOAuth2ClientInput,
  CreatePgDatabaseInput,
  CreatePgRoleInput,
  CreateUserInput,
  CredentialResetIntent,
  DirectoryAdapter,
  DirectoryAdapterType,
  DirectoryGroup,
  DirectoryOrchestrator,
  DirectoryUser,
  DkimKey,
  DnsRecord,
  EnsureAwsAccountInput,
  EnsureAwsIamRoleInput,
  EnsureAwsOuInput,
  GetDirectoryAdapterOptions,
  KanidmDirectoryAdapter,
  KanidmOptions,
  Mailbox,
  MailDomain,
  OAuth2Client,
  PgDatabase,
  PgRole,
  PostgresDirectoryAdapter,
  PostgresOptions,
  PutAwsIamRolePolicyInput,
  StalwartDirectoryAdapter,
  StalwartOptions,
  TenantProvisioningInput,
  TenantProvisioningResult,
  UpdateGroupInput,
  UpdateMailboxInput,
  UpdateOAuth2ClientInput,
  UpdateUserInput,
} from './shared/types.js';
