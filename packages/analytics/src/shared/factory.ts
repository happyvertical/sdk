/**
 * Factory function for creating analytics provider instances
 */

import { loadEnvConfig, ValidationError } from '@happyvertical/utils';

import type {
  AnalyticsInterface,
  GA4Options,
  GetAnalyticsOptions,
  PlausibleOptions,
} from './types.js';

/**
 * Type guard for GA4 options
 */
function isGA4Options(options: GetAnalyticsOptions): options is GA4Options {
  return options.type === 'ga4';
}

/**
 * Type guard for Plausible options
 */
function isPlausibleOptions(
  options: GetAnalyticsOptions,
): options is PlausibleOptions {
  return options.type === 'plausible';
}

/**
 * Creates an analytics provider instance based on the provided options.
 *
 * Supports environment variable configuration using the pattern:
 * - HAVE_ANALYTICS_TYPE → provider type ('ga4' | 'plausible')
 * - HAVE_ANALYTICS_SERVICE_ACCOUNT_KEY → path to service account JSON or JSON string
 * - HAVE_ANALYTICS_MEASUREMENT_ID → GA4 measurement ID (G-XXXXXXX)
 * - HAVE_ANALYTICS_API_SECRET → GA4 API secret for Measurement Protocol
 * - HAVE_ANALYTICS_DEFAULT_PROPERTY_ID → default property ID
 * - HAVE_ANALYTICS_API_KEY → Plausible API key
 * - HAVE_ANALYTICS_BASE_URL → Plausible base URL (for self-hosted)
 * - HAVE_ANALYTICS_DEFAULT_SITE_ID → Plausible default site ID
 * - HAVE_ANALYTICS_TIMEOUT → request timeout in milliseconds
 * - HAVE_ANALYTICS_MAX_RETRIES → maximum retry attempts
 * - HAVE_ANALYTICS_CACHE_TTL → cache TTL in milliseconds
 *
 * User-provided options always take precedence over environment variables.
 *
 * @param options - Configuration options for the analytics provider
 * @returns Promise resolving to an analytics provider instance
 * @throws {ValidationError} When the provider type is unsupported or required options are missing
 *
 * @example
 * ```typescript
 * // Create GA4 client with explicit options
 * const ga4 = await getAnalytics({
 *   type: 'ga4',
 *   serviceAccountKey: '/path/to/service-account.json',
 *   measurementId: 'G-XXXXXXXXXX',
 *   apiSecret: 'your-api-secret'
 * });
 *
 * // Create Plausible client
 * const plausible = await getAnalytics({
 *   type: 'plausible',
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://plausible.io' // or self-hosted URL
 * });
 *
 * // Use environment variables
 * // Set: HAVE_ANALYTICS_TYPE=ga4, HAVE_ANALYTICS_SERVICE_ACCOUNT_KEY=/path/to/key.json, etc.
 * const client = await getAnalytics({ type: 'ga4' });
 * ```
 */
export async function getAnalytics(
  options: GetAnalyticsOptions,
): Promise<AnalyticsInterface> {
  // Load environment variables with user options taking precedence
  const loadedConfig = loadEnvConfig(
    options as unknown as Record<string, unknown>,
    {
      packageName: 'analytics',
      schema: {
        type: 'string',
        serviceAccountKey: 'string',
        measurementId: 'string',
        apiSecret: 'string',
        defaultPropertyId: 'string',
        apiKey: 'string',
        baseUrl: 'string',
        defaultSiteId: 'string',
        timeout: 'number',
        maxRetries: 'number',
        cacheTTL: 'number',
      },
    },
  );
  options = loadedConfig as unknown as GetAnalyticsOptions;

  if (isGA4Options(options)) {
    const { GA4Provider } = await import('./providers/ga4.js');
    return new GA4Provider(options);
  }

  if (isPlausibleOptions(options)) {
    const { PlausibleProvider } = await import('./providers/plausible.js');
    return new PlausibleProvider(options);
  }

  throw new ValidationError('Unsupported analytics provider type', {
    supportedTypes: ['ga4', 'plausible'],
    providedType: (options as { type?: string }).type,
  });
}
