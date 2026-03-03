# @happyvertical/social

Social platform publishing for text, image, and video content. Factory: `getSocial(config)`.

## Adapters

- **youtube** -- Video/image/text via YouTube Data API v3 (OAuth2)
- **threads** -- Meta Threads API (access token + user ID)
- **x** -- X/Twitter API v2 (OAuth 1.0a four-token auth)
- **bluesky** -- AT Protocol (identifier + app password)

## Key patterns

- `getSocialMulti(configs)` creates adapters for multiple platforms at once
- `publishToAll(adapters, content)` broadcasts to all platforms, returns a `Map` of per-platform results (never throws on individual failures)
- Each adapter exposes `getCapabilities()` describing supported content types, max lengths, and video limits
- Config accepts optional `rateLimit` and `timeout` per adapter

## Gotchas

- YouTube requires OAuth2 client credentials; Bluesky uses app passwords (not main password)
- `publishToAll` catches per-platform errors silently -- check the result map for `success: false`
- No built-in env-var loading; pass credentials explicitly in config
- Threads requires both `accessToken` and `userId`
