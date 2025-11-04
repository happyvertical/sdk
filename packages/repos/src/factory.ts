/**
 * Repository factory function
 *
 * Creates repository instances following the pattern from @have/files and @have/sql
 */

import { RepositoryError, RepositoryErrorCode } from './errors.js';
import type { IRepository, RepositoryConfig } from './types.js';

/**
 * Check if value is already a repository instance
 */
function isRepositoryInstance(value: unknown): value is IRepository {
  return (
    value !== null &&
    typeof value === 'object' &&
    'getIssue' in value &&
    'createIssue' in value &&
    'addLabels' in value &&
    typeof (value as IRepository).getIssue === 'function'
  );
}

/**
 * Get a repository client instance
 *
 * This is the main entry point following the pattern from @have/files and @have/sql.
 * It can accept either a configuration object or an existing repository instance.
 *
 * @param options - Repository configuration or existing repository instance
 * @returns Promise resolving to repository interface
 *
 * @example
 * ```typescript
 * import { getRepository } from '@have/repos';
 *
 * // Create a GitHub repository client
 * const repo = await getRepository({
 *   type: 'github',
 *   owner: 'happyvertical',
 *   repo: 'sdk',
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * // Use the client
 * const issue = await repo.getIssue(352);
 * await repo.addLabels(352, ['type: feature', 'priority: high']);
 *
 * // Pass existing instance (returns it unchanged)
 * const sameRepo = await getRepository(repo);
 * ```
 */
export async function getRepository(
  options: RepositoryConfig | IRepository,
): Promise<IRepository> {
  // If already a repository instance, return it
  if (isRepositoryInstance(options)) {
    return options;
  }

  // Validate configuration
  if (!options.type) {
    throw new RepositoryError(
      'Repository type is required',
      RepositoryErrorCode.VALIDATION_ERROR,
    );
  }

  if (!options.owner || !options.repo) {
    throw new RepositoryError(
      'Repository owner and repo are required',
      RepositoryErrorCode.VALIDATION_ERROR,
    );
  }

  if (!options.token) {
    throw new RepositoryError(
      'Authentication token is required',
      RepositoryErrorCode.UNAUTHORIZED,
    );
  }

  // Create repository instance based on type
  switch (options.type) {
    case 'github': {
      const { GitHubRepository } = await import('./github/index.js');
      return new GitHubRepository(options);
    }

    case 'gitlab':
      throw new RepositoryError(
        'GitLab support not yet implemented',
        RepositoryErrorCode.UNKNOWN,
      );

    case 'bitbucket':
      throw new RepositoryError(
        'Bitbucket support not yet implemented',
        RepositoryErrorCode.UNKNOWN,
      );

    case 'azure':
      throw new RepositoryError(
        'Azure DevOps support not yet implemented',
        RepositoryErrorCode.UNKNOWN,
      );

    default:
      throw new RepositoryError(
        `Unsupported repository type: ${options.type}`,
        RepositoryErrorCode.VALIDATION_ERROR,
      );
  }
}
