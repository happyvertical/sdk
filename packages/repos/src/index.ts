/**
 * @happyvertical/repos - Standardized repository interface
 *
 * Provides a unified interface for repository operations across GitHub, GitLab,
 * Bitbucket, and Azure DevOps.
 *
 * @example
 * ```typescript
 * import { getRepository } from '@happyvertical/repos';
 *
 * const repo = await getRepository({
 *   type: 'github',
 *   owner: 'happyvertical',
 *   repo: 'sdk',
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * const issue = await repo.getIssue(352);
 * await repo.addLabels(352, ['type: feature']);
 * ```
 */

export {
  RepositoryError,
  RepositoryErrorCode,
} from './errors.js';
export { getRepository } from './factory.js';
export type { ForgeErrorCode } from './forge/errors.js';
export {
  ForgeError,
  ForgeSignatureError,
} from './forge/errors.js';
export {
  BuzzRelayClient,
  BUZZ_FIXTURE_PUBKEYS,
  BUZZ_FORGE_KINDS,
  channelIdFromEvent,
  computeNostrEventId,
  createApprovalFixture,
  createBuzzConvergenceSequences,
  createBuzzFixtureEvent,
  createMembersFixture,
  createPatchFixture,
  createRefUpdateFixture,
  createRepositoryAnnouncementFixture,
  createStatusFixture,
  normalizeBuzzEvent,
  resolveBuzzChannelRole,
  roleMeetsFloor,
  verifyAndNormalizeBuzzEvent,
  verifyNostrEventSignature,
} from './buzz/index.js';
export type {
  BuzzChannelRole,
  BuzzForgeKind,
  BuzzRelayClientOptions,
  BuzzRelaySubscription,
  BuzzRoleResolution,
  NostrForgeEvent,
} from './buzz/index.js';
export type {
  CheckRun,
  CheckRunOutput,
  CommitStatus,
  CreateCheckRunInput,
  CreateCommitStatusInput,
  ForgeActor,
  ForgeAvailabilityObservation,
  ForgeCheckConclusion,
  ForgeCheckObservation,
  ForgeCheckStatus,
  ForgeDeploymentObservation,
  ForgeEventEnvelope,
  ForgeInstallationObservation,
  ForgeInstallationRef,
  ForgeMergeGroupObservation,
  ForgeMergeObservation,
  ForgeObservation,
  ForgeOperations,
  ForgeProvider,
  ForgePullRequestObservation,
  ForgePullRequestRef,
  ForgePushObservation,
  ForgeRateLimit,
  ForgeRepositoryObservation,
  ForgeRepositoryRef,
  ForgeResponse,
  ForgeResponseMetadata,
  ForgeReviewObservation,
  ForgeStatusObservation,
  ForgeTransport,
  ForgeTransportRequest,
  ForgeUnknownObservation,
  UpdateCheckRunInput,
} from './forge/types.js';
export type {
  GitHubAppAuthOptions,
  GitHubAppCredentials,
  GitHubInstallationContext,
  GitHubInstallationScope,
} from './github/app.js';
export {
  createGitHubAppJwt,
  GitHubAppAuth,
} from './github/app.js';
export type { GitHubWebhookFixture } from './github/fixtures.js';
export { createGitHubWebhookFixture } from './github/fixtures.js';
export type { GitHubForgeProviderOptions } from './github/forge.js';
export { GitHubForgeProvider } from './github/forge.js';
export { GitHubRepository } from './github/index.js';
export type {
  GitHubTokenSource,
  GitHubTransportOptions,
} from './github/transport.js';
export { GitHubTransport } from './github/transport.js';
export type {
  GitHubWebhookHeaders,
  GitHubWebhookVerifierOptions,
} from './github/webhooks.js';
export {
  GitHubWebhookVerifier,
  normalizeGitHubWebhook,
} from './github/webhooks.js';
export type { IssueTemplate, TemplateField } from './parsing.js';
export {
  detectTemplateFromLabels,
  fetchIssueTemplates,
  getIssueField,
  loadIssueTemplate,
  parseIssueBody,
  parseIssueTemplate,
  renderIssueBody,
  updateIssueField,
} from './parsing.js';
export type {
  Branch,
  Comment,
  CreateFromTemplateOptions,
  CreateIssueInput,
  CreatePRInput,
  IRepository,
  Issue,
  Label,
  MergeMethod,
  PullRequest,
  Repository,
  RepositoryConfig,
  SearchFilters,
  UpdateIssueInput,
  User,
} from './types.js';
