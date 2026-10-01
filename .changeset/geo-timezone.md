---
'@happyvertical/geo': minor
---

Fill `Location.timezone` with an IANA time zone (for example `'America/Edmonton'`) on every geocode, reverse geocode, and POI result. The new `timezoneLookup` option (env `HAVE_GEO_TIMEZONE_LOOKUP`) picks the source: `'offline'` (default) uses the bundled `@photostructure/tz-lookup` table, a new runtime dependency (CC0-1.0, about 90 KB, no dependencies); `'api'` asks the Google Time Zone API with one concurrent call per distinct coordinate and falls back to the offline table (OpenStreetMap has no time zone API, so `'api'` there warns once and uses the table); `'none'` leaves `timezone` unset. This is a default behavior change: results now carry `timezone` unless you set `'none'`. Unknown values throw a `GeoError` (`INVALID_OPTION`). `timezoneForCoordinates(latitude, longitude)` is exported for direct use.
