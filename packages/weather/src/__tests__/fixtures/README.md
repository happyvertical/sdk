# Environment Canada test fixtures

Recorded responses from the MSC Geomet API, used so the Environment Canada
provider specs run offline and deterministically. No live request is made by
the default `test` task.

## `environment-canada-citypage-calgary.json`

The `citypageweather-realtime` collection response for the bounding box that
`EnvironmentCanadaProvider.buildApiUrl` derives from Calgary, AB
(51.0447, -114.0719).

Recorded 2026-07-28 with:

```bash
curl -s 'https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&bbox=-115.0719,50.0447,-113.0719,52.0447&limit=1'
```

Kept verbatim except for `properties.hourlyForecastGroup`, which the provider
never reads and which accounted for roughly a third of the payload.

The recording deliberately preserves two upstream quirks the transform has to
survive, so do not "clean" them up:

- `currentConditions.wind.speed.value.en` is the string `"calm"`, not a number.
- `currentConditions` carries no `condition` field.

## Re-recording

Re-record only when the upstream schema changes, and re-run
`ENVIRONMENT_CANADA_INTEGRATION=1 pnpm --filter @happyvertical/weather test:optional`
afterwards to confirm the live service still matches the fixture's shape.
