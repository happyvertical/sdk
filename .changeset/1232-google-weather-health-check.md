---
"@happyvertical/weather": patch
---

Fix `GoogleWeatherProvider.testConnection()` so it probes the daily forecast
endpoint used by the production fetch path instead of current conditions, and
require the probe to return at least one forecast day rather than trusting the
HTTP status. Also map a `400` carrying an `API_KEY_INVALID` reason to
`AuthenticationError` so callers stop retrying a credential that cannot succeed.
