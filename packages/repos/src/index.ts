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
export { GitHubRepository } from './github/index.js';
export type { IssueTemplate, TemplateField } from './parsing.js';
export {
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
