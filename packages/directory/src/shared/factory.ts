/**
 * Factory functions and type guards for @happyvertical/directory package
 */

import type {
  AwsDirectoryAdapter,
  AwsOptions,
  DirectoryAdapter,
  GetDirectoryAdapterOptions,
  KanidmDirectoryAdapter,
  KanidmOptions,
  PostgresDirectoryAdapter,
  PostgresOptions,
  StalwartDirectoryAdapter,
  StalwartOptions,
} from './types.js';

// ============================================================================
// Type Guards
// ============================================================================

export function isKanidmOptions(
  opts: GetDirectoryAdapterOptions,
): opts is KanidmOptions {
  return opts.type === 'kanidm';
}

export function isStalwartOptions(
  opts: GetDirectoryAdapterOptions,
): opts is StalwartOptions {
  return opts.type === 'stalwart';
}

export function isPostgresOptions(
  opts: GetDirectoryAdapterOptions,
): opts is PostgresOptions {
  return opts.type === 'postgres';
}

export function isAwsOptions(
  opts: GetDirectoryAdapterOptions,
): opts is AwsOptions {
  return opts.type === 'aws';
}

// ============================================================================
// Generic Factory
// ============================================================================

/**
 * Create a directory adapter instance (returns base DirectoryAdapter)
 *
 * @example
 * ```typescript
 * const adapter = await getDirectoryAdapter({
 *   type: 'kanidm',
 *   baseUrl: 'https://idm.example.com',
 *   adminUsername: 'admin',
 *   adminPassword: 'secret',
 * });
 * ```
 */
export async function getDirectoryAdapter(
  options: GetDirectoryAdapterOptions,
): Promise<DirectoryAdapter> {
  if (isKanidmOptions(options)) {
    const { KanidmAdapter } = await import('../adapters/kanidm.js');
    return new KanidmAdapter(options);
  }

  if (isStalwartOptions(options)) {
    const { StalwartAdapter } = await import('../adapters/stalwart.js');
    return new StalwartAdapter(options);
  }

  if (isPostgresOptions(options)) {
    const { PostgresAdapter } = await import('../adapters/postgres.js');
    return new PostgresAdapter(options);
  }

  if (isAwsOptions(options)) {
    const { AwsAdapter } = await import('../adapters/aws.js');
    return new AwsAdapter(options);
  }

  throw new Error(
    `Unknown directory adapter type: ${(options as { type: string }).type}`,
  );
}

// ============================================================================
// Typed Convenience Factories
// ============================================================================

/**
 * Create a Kanidm directory adapter with full OAuth2 support
 */
export async function getKanidmAdapter(
  options: Omit<KanidmOptions, 'type'>,
): Promise<KanidmDirectoryAdapter> {
  const { KanidmAdapter } = await import('../adapters/kanidm.js');
  return new KanidmAdapter({ type: 'kanidm', ...options });
}

/**
 * Create a Stalwart directory adapter with domain/mailbox support
 */
export async function getStalwartAdapter(
  options: Omit<StalwartOptions, 'type'>,
): Promise<StalwartDirectoryAdapter> {
  const { StalwartAdapter } = await import('../adapters/stalwart.js');
  return new StalwartAdapter({ type: 'stalwart', ...options });
}

/**
 * Create a PostgreSQL directory adapter with database/role provisioning
 */
export async function getPostgresAdapter(
  options: Omit<PostgresOptions, 'type'>,
): Promise<PostgresDirectoryAdapter> {
  const { PostgresAdapter } = await import('../adapters/postgres.js');
  return new PostgresAdapter({ type: 'postgres', ...options });
}

/**
 * Create an AWS directory adapter with Organizations/IAM support
 */
export async function getAwsAdapter(
  options: Omit<AwsOptions, 'type'>,
): Promise<AwsDirectoryAdapter> {
  const { AwsAdapter } = await import('../adapters/aws.js');
  return new AwsAdapter({ type: 'aws', ...options });
}
