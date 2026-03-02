# @happyvertical/weather

Weather data providers. Factory: `getWeatherAdapter(options): Promise<IWeatherAdapter>`.

## Adapters

Environment Canada (free, Canada-only), OpenWeatherMap (free tier, 3h granularity), OpenWeatherMap OneCall (paid, hourly), Google Weather (paid, pagination).

## Gotchas

- Google Weather uses `nextPageToken` pagination — auto-follows, multiplies API calls
- Environment Canada validates coordinate bounds (Canada only)
- All temps normalized to Celsius; unit converters provided
- Defaults to Environment Canada if no provider specified
