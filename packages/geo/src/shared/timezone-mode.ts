/**
 * Validation for the `timezoneLookup` adapter option.
 *
 * @internal
 */

import type { TimezoneLookupMode } from './timezone';
import { GeoError } from './types';

const MODES: readonly TimezoneLookupMode[] = ['offline', 'api', 'none'];

let warnedOsmApiMode = false;

/**
 * Returns a valid `timezoneLookup` mode for a provider, defaulting to
 * `'offline'`. Values are trimmed and case-insensitive (environment variables
 * arrive as strings). Anything else throws a `GeoError` naming the accepted
 * values, rather than silently disabling or changing the lookup.
 *
 * `'api'` exists only for Google; OpenStreetMap has no time zone API, so it
 * warns once per process and uses `'offline'`.
 */
export function resolveTimezoneLookup(
  value: unknown,
  provider: 'google',
): TimezoneLookupMode;
export function resolveTimezoneLookup(
  value: unknown,
  provider: 'openstreetmap',
): 'offline' | 'none';
export function resolveTimezoneLookup(
  value: unknown,
  provider: 'google' | 'openstreetmap',
): TimezoneLookupMode {
  if (value === undefined || value === null || value === '') {
    return 'offline';
  }

  const mode =
    typeof value === 'string'
      ? (value.trim().toLowerCase() as TimezoneLookupMode)
      : undefined;
  if (!mode || !MODES.includes(mode)) {
    throw new GeoError(
      `Invalid timezoneLookup ${JSON.stringify(value)} (option or HAVE_GEO_TIMEZONE_LOOKUP): expected 'offline', 'api', or 'none'.`,
      'INVALID_OPTION',
      provider,
    );
  }

  if (mode === 'api' && provider === 'openstreetmap') {
    if (!warnedOsmApiMode) {
      warnedOsmApiMode = true;
      console.warn(
        "@happyvertical/geo: timezoneLookup: 'api' is only supported by the Google provider; OpenStreetMap uses the offline time zone table.",
      );
    }
    return 'offline';
  }

  return mode;
}
