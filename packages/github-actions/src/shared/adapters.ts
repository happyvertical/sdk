/**
 * Adapters for @happyvertical/repos and @happyvertical/projects
 *
 * These functions adapt the standardized interfaces from @happyvertical/repos and @happyvertical/projects
 * to work with the triage context structure used in this package.
 */

import type { IProject } from '@happyvertical/projects';
import { getProject } from '@happyvertical/projects';
import type { IRepository } from '@happyvertical/repos';
import { getRepository } from '@happyvertical/repos';

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
