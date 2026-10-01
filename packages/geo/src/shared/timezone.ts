/**
 * IANA time zone resolution for geocoded coordinates.
 *
 * Offline lookups use `@photostructure/tz-lookup` (CC0-1.0, no runtime
 * dependencies, ~90 KB), a maintained fork of `tz-lookup` whose compressed
 * boundary table is regenerated from timezone-boundary-builder releases. It
 * answers in microseconds without network access, so every provider can fill
 * `Location.timezone` without extra billed requests or rate-limit pressure.
 *
 * The table trades precision for size: within a few kilometres of a zone
 * boundary it can pick the neighbouring zone. Callers that need exact answers
 * near borders can use the Google provider's `timezoneLookup: 'api'` mode.
 */

import tzLookup from '@photostructure/tz-lookup';
import type { Location } from './types';
import { validateCoordinates } from './utils';

/**
 * How a provider fills `Location.timezone`.
 *
 * - `'offline'` (default): bundled boundary table, no network requests.
 * - `'api'`: provider time zone API (Google Time Zone API only), falling back
 *   to the offline table when the API call fails.
 * - `'none'`: leave `timezone` unset.
 */
export type TimezoneLookupMode = 'offline' | 'api' | 'none';

/**
 * Returns the IANA time zone for a coordinate using the bundled offline
 * boundary table, or `undefined` when the coordinate is invalid.
 *
 * @example
 * ```ts
 * timezoneForCoordinates(53.5461, -113.4938); // 'America/Edmonton'
 * ```
 */
export function timezoneForCoordinates(
  latitude: number,
  longitude: number,
): string | undefined {
  if (!validateCoordinates(latitude, longitude).valid) {
    return undefined;
  }
  return tzLookup(latitude, longitude);
}

/**
 * Fills `timezone` on each location from the offline table, keeping any value
 * a provider already set. Returns the same array for chaining.
 */
export function withOfflineTimezones(locations: Location[]): Location[] {
  for (const location of locations) {
    if (location.timezone) continue;
    const timezone = timezoneForCoordinates(
      location.latitude,
      location.longitude,
    );
    if (timezone) {
      location.timezone = timezone;
    }
  }
  return locations;
}
