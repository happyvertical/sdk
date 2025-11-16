---
"@happyvertical/weather": patch
---

fix(weather): ensure windSpeed is always a number in Environment Canada provider

The Environment Canada API returns wind speed values as strings instead of numbers. This change wraps the wind speed values with Number() to ensure they are always returned as numbers, matching the WeatherForecast type interface.

Fixes test failure in environment-canada.spec.ts where windSpeed type assertion was failing.
