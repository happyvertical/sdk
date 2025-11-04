/**
 * Adapters for @have/repos and @have/projects
 *
 * These functions adapt the standardized interfaces from @have/repos and @have/projects
 * to work with the triage context structure used in this package.
 */

import type { IProject } from '@have/projects';
import { getProject } from '@have/projects';
import type { IRepository } from '@have/repos';
import { getRepository } from '@have/repos';

/**
 * Create a repository client from GitHub context
 */
export async function createRepository(
  token: string,
  owner: string,
  repo: string,
): Promise<IRepository> {
  return getRepository({
    type: 'github',
    owner,
    repo,
    token,
  });
}

/**
 * Create a project client from configuration
 */
export async function createProject(
  token: string,
  projectId: string,
  statusFieldId: string,
  statusOptions: Record<string, string>,
): Promise<IProject> {
  return getProject({
    type: 'github',
    projectId,
    token,
    statusFieldId,
    statusOptions,
  });
}
