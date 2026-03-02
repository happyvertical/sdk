# @happyvertical/geo

Geographic services. Factory: `getGeoAdapter(options): Promise<GeoAdapter>`.

## Adapters

Google Maps (`@googlemaps/google-maps-services-js`, paid), OpenStreetMap (Nominatim, free).

## Gotchas

- OpenStreetMap enforces 1-req/sec rate limit (`rateLimitDelay`, default 1000ms)
- Google uses `place_id`; OSM returns `osm-` prefixed IDs
- Empty results return empty array, not error
- OSM requires User-Agent header (Nominatim policy)
- Env: `GOOGLE_MAPS_API_KEY` (non-standard, no `HAVE_` prefix)
