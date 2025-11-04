/**
 * @have/projects - Standardized project management interface
 *
 * Provides a unified interface for project management operations across GitHub Projects,
 * Jira, ZenHub, and Linear.
 *
 * @example
 * ```typescript
 * import { getProject } from '@have/projects';
 * import { getRepository } from '@have/repos';
 *
 * const repo = await getRepository({
 *   type: 'github',
 *   owner: 'happyvertical',
 *   repo: 'sdk',
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * const project = await getProject({
 *   type: 'github',
 *   projectId: 'PVT_kwDOB9Y8ns4A8-TY',
 *   token: process.env.GITHUB_TOKEN,
 *   statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',
 *   statusOptions: {
 *     'New': 'option-id-1',
 *     'Backlog': 'option-id-2',
 *     'In Progress': 'option-id-3',
 *     'Done': 'option-id-4'
 *   }
 * });
 *
 * // Add issue to project
 * const issue = await repo.getIssue(352);
 * const item = await project.addItem(issue.id);
 *
 * // Update status
 * await project.updateItemStatus(item.id, 'In Progress');
 * ```
 */

export { ProjectError, ProjectErrorCode } from './errors.js';
export { getProject } from './factory.js';
export { GitHubProject } from './github/index.js';

export type {
  Field,
  FieldOption,
  IProject,
  ItemFilters,
  KanbanStatus,
  Project,
  ProjectConfig,
  ProjectItem,
  Status,
} from './types.js';

export { KANBAN_STATUSES } from './types.js';
