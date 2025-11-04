/**
 * Project factory function
 *
 * Creates project instances following the pattern from @have/files and @have/sql
 */

import { ProjectError, ProjectErrorCode } from './errors.js';
import type { IProject, ProjectConfig } from './types.js';

/**
 * Check if value is already a project instance
 */
function isProjectInstance(value: unknown): value is IProject {
  return (
    value !== null &&
    typeof value === 'object' &&
    'getProject' in value &&
    'addItem' in value &&
    'updateItemStatus' in value &&
    typeof (value as IProject).getProject === 'function'
  );
}

/**
 * Get a project management client instance
 *
 * This is the main entry point following the pattern from @have/files and @have/sql.
 * It can accept either a configuration object or an existing project instance.
 *
 * @param options - Project configuration or existing project instance
 * @returns Promise resolving to project interface
 *
 * @example
 * ```typescript
 * import { getProject } from '@have/projects';
 *
 * // Create a GitHub Projects client
 * const project = await getProject({
 *   type: 'github',
 *   owner: 'happyvertical',
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
 * // Use the client
 * await project.addItem(issueNodeId);
 * await project.updateItemStatus(itemId, 'In Progress');
 *
 * // Pass existing instance (returns it unchanged)
 * const sameProject = await getProject(project);
 * ```
 */
export async function getProject(
  options: ProjectConfig | IProject,
): Promise<IProject> {
  // If already a project instance, return it
  if (isProjectInstance(options)) {
    return options;
  }

  // Validate configuration
  if (!options.type) {
    throw new ProjectError(
      'Project type is required',
      ProjectErrorCode.VALIDATION_ERROR,
    );
  }

  if (!options.projectId) {
    throw new ProjectError(
      'Project ID is required',
      ProjectErrorCode.VALIDATION_ERROR,
    );
  }

  if (!options.token) {
    throw new ProjectError(
      'Authentication token is required',
      ProjectErrorCode.UNAUTHORIZED,
    );
  }

  // Create project instance based on type
  switch (options.type) {
    case 'github': {
      const { GitHubProject } = await import('./github/index.js');
      return new GitHubProject(options);
    }

    case 'jira':
      throw new ProjectError(
        'Jira support not yet implemented',
        ProjectErrorCode.UNKNOWN,
      );

    case 'zenhub':
      throw new ProjectError(
        'ZenHub support not yet implemented',
        ProjectErrorCode.UNKNOWN,
      );

    case 'linear':
      throw new ProjectError(
        'Linear support not yet implemented',
        ProjectErrorCode.UNKNOWN,
      );

    default:
      throw new ProjectError(
        `Unsupported project type: ${options.type}`,
        ProjectErrorCode.VALIDATION_ERROR,
      );
  }
}
