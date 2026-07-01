### SDK foundation conventions

This is the HAVE SDK — the dependency root of the org's ecosystem. Every
package follows the `getX(config)` adapter-factory pattern (`getAI`,
`getDatabase`, `getFilesystem`, `getCache`, `getWeather`, `getAnalytics`,
`getSocial`, …) returning a stable interface that hides a swappable
provider underneath. When reviewing:

- **Breaking changes ripple downstream.** SDK → SMRT → praeco / caelus /
  ludis / anytown / ergot. A renamed interface method, a tightened option
  type, or a new required field in `getX(config)` cascades through every
  consumer. Flag breaking surface changes that don't have either (a) a
  deprecation path keeping the old signature working for one minor, or
  (b) an explicit `BREAKING CHANGE:` footer in the conventional commit
  with a migration note in the changeset.
- **Vendor SDKs sit in `dependencies`, not `peerDependencies` or
  `optionalDependencies`.** Despite the README claiming "third-party
  vendor SDKs are optional peer dependencies", current `packages/*/
  package.json` puts them under `dependencies`. A PR that adds a new
  vendor SDK should pull it in the same way (consistency), but should
  also justify the bundle size cost — every consumer of the package
  installs every vendor SDK whether they use that provider or not.
- **`HAVE_<PACKAGE>_*` env-var prefix.** Auto-detection paths
  (`getAIAuto`, `getDatabaseAuto`, etc.) read from `HAVE_AI_*`,
  `HAVE_SQL_*`, `HAVE_FILES_*`, etc. New providers must register their
  env signals there; new options must not invent a new prefix.
- **ESM only, Node 24+, no CommonJS shims.** A PR that adds a
  `"main": "./dist/index.cjs"` field or `require()` call is regressing
  the bar.

### Multi-provider footguns (`@happyvertical/ai`, weather, analytics,
social, geo, translator, auth, cache, payments)

Most SDK packages ship multiple providers behind one interface. The
hottest review-comment area in the repo is *cross-provider parity* —
adding a feature to provider A and forgetting that providers B/C/D need
matching surface or a clean `UnsupportedXyzCapabilityError`.

- **Interface-level additions need every provider updated.** When
  `IWeatherProvider.fetchHistoricalForLocation` lands, every provider
  (Google, Environment Canada, Open-Meteo, OpenWeatherMap…) must either
  implement it or throw a typed `UnsupportedWeatherCapabilityError`. A
  silent `Method not implemented.` `throw` is a regression. Same shape
  in `social` (`publishLink` / `publishVideo` `NOT_SUPPORTED` /
  `NOT_IMPLEMENTED` error codes), `analytics` (`PropertyNotFoundError`
  consistency), `translator`, `cache`.
- **Auto-detection (`getXAuto`) is full of overlap traps.** Recent
  examples from `@happyvertical/ai`: a custom `baseUrl` hijacked remote
  Ollama setups by forcing `type: 'litellm'`; an explicit `keepAlive: 0`
  failed to select Ollama because the check was truthy-only; an explicit
  `authType: 'oauth1'` was silently overridden to OAuth 2.0 when
  `accessSecret` was missing (`x.ts:usesOAuth2()`). Pattern: when adding
  a new signal to auto-detect, walk every other provider's signal and
  ensure they're (a) mutually exclusive *or* (b) ordered so an explicit
  user choice beats inference. Add a regression test for the case where
  signal A and signal B both look plausible.
- **`Retry-After` parsing differs per provider.** Anthropic, OpenAI, and
  Gemini all surface 429 retry hints with slightly different headers /
  response shapes. The shared `getRetryAfterMs` extraction lives in
  `packages/ai/src/shared/rate-limit.ts`; a new provider's 429 mapping
  should plug into it, not roll its own. Honor provider hints over the
  configured fallback delay (don't `Math.max(initialDelayMs,
  hintedDelayMs)` if hint < initialDelayMs — that defeats the hint).
- **Analytics number-coercion**: `|| 0` on a possibly-missing metric
  (`relative_humidity_2m?.[i] || 0`, reaction counts, etc.) silently
  reports zeros as real measurements. Use `?? undefined` /
  `valueOrUndefined()` helpers to preserve the distinction between
  "zero" and "missing".
- **Social-platform MIME hardcoding.** Bluesky `uploadBlob` and YouTube
  `thumbnails.set` reject mismatched bytes when a JPEG is uploaded with
  `Content-Type: 'image/png'`. New media-upload code needs MIME sniffing
  (detect from bytes / URL response) and a way for callers to override
  via `mimeType` field.
- **Safety/staging modes** (`dry_run`, `stage_remote`,
  `private_or_scheduled`, `public` in `@happyvertical/social`): the
  `dry_run` early return must come *before* any side-effect — Buffer →
  URL conversion via `uploadToTempStorage`, blob uploads, anything that
  calls out to the provider. Recurring bug pattern caught at review
  multiple times on Threads adapter.

### `@happyvertical/sql` cross-database concerns

The package supports SQLite (libsql/Turso), PostgreSQL, DuckDB, and a
JSON file adapter. Almost every SQL change has to be cross-checked
against all four adapters.

- **Raw `query()` placeholder semantics differ per adapter and are
  ambiguous on Postgres.** SQLite uses `?`, Postgres uses `$1..$n`, and
  the package's normalization tries to support both. Single-element
  array params on Postgres (`query('SELECT $1::text[]', ['only'])`) are
  ambiguous between "one array param" and "one scalar value-list"; the
  normalizer guesses wrong in the single-arg case. Flag any new raw
  query helper that doesn't address this, and ensure JSONB operators
  (`?`, `?|`, `?&`) aren't corrupted by `?`-rewriting on Postgres
  (regression history: #1018, #1019).
- **`upsert()` and `ON CONFLICT` with nullable conflict columns.**
  Postgres / SQLite default to `NULLS DISTINCT` so an upsert against a
  row with a `NULL` conflict value duplicate-inserts instead of
  matching. The fix lives in `executeNullAware*Upsert` paths; new
  adapter code (or DuckDB / JSON variants) must use the same approach,
  and the in-process advisory lock keying needs to handle URL
  normalization (relative vs absolute paths, `file:` URI prefix,
  case-insensitive filesystems → different lock keys, no coordination).
- **Cross-adapter parity for CRUD helpers.** Helpers like `get`,
  `update`, `delete`, `count` should go through the shared null-aware
  `buildWhere`, and should reject empty `where` clauses on `get`/
  `update` to avoid silent broad reads/writes.
- **Connection caching pitfalls** (Postgres): cache key must include
  `user`, not just `host:port/database` (different credentials to the
  same DB silently share a Pool); cache hit must still apply
  `options.schemas`; `pool.end()` must evict the cache entry so a
  subsequent `getDatabase()` doesn't return an ended pool.
- **DDL-on-request-path is forbidden** in SDK code. The SDK exposes
  schema-sync helpers (`createTablesFromSchemas`) callable at startup,
  not from inside `db.get()` / `db.insert()`.
- **`hashtext(...)` collision keying** for `pg_advisory_xact_lock`: int4
  hash space is small; document the collision tradeoff or upgrade to
  bigint hash.

### `@happyvertical/files` and streaming

- **Atomic-write semantics** (`fetchToFile()` / `writeResponseToFile()`):
  writes go to a temp sibling then `rename()` into place. Pitfalls
  reviewers consistently catch:
  - `rename()` replaces the destination inode → drops existing
    mode/ACL/ownership. If a refresh is rewriting a tightened-down file,
    capture and re-apply the prior permissions.
  - `rename()` over a symlink destroys the symlink and writes a regular
    file at the link location. If symlink-following semantics are
    expected, resolve first.
  - `maxBytes` enforcement must happen in the stream `Transform`, not
    post-write.
  - Timeout tests using a 10ms timeout vs 100ms server delay are flaky
    on CI — widen the gap.
- **`assertOkResponse()` parity.** `fetchBuffer()` / `fetchToFile()`
  throw on non-2xx; `fetchText()` / `fetchJSON()` historically don't.
  Either align all four to throw (and document it as a breaking change)
  or fix the docstrings — don't ship one-off divergence.
- **Path-safety on local filesystem provider.** `validatePath()` doesn't
  reject absolute paths, but the cache and write paths use
  `resolve(this.cacheDir, file)` which ignores `cacheDir` when `file` is
  absolute (`/etc/passwd`). Any new cache/write entry-point must
  normalize to a relative path or explicitly reject absolute inputs.
- **`LocalFilesystemProvider` and base-path double-prefix**: passing
  `basePath: ''` to `super(...)` is a known band-aid for a base-class
  bug where `BaseFilesystemProvider.normalizePath` re-prefixes a base
  path the subclass already applied via `rootPath`. New providers that
  manage their own root will re-introduce the bug. Fix the base class,
  or at minimum add a comment at the call site explaining the trick.

### `@happyvertical/encryption` and `@happyvertical/secrets`

- **Envelope encryption hierarchy is AMK → TDEK → secret value.** Don't
  shortcut by encrypting payloads directly with the AMK; the per-tenant
  data encryption key is the rotation seam.
- **Cross-package `secrets` ↔ `sql` calls**: the `secrets` package issues
  raw SQL via the `sql` adapter. Recurring bug: passing an array where
  a scalar is expected (`#944`). When you see raw SQL in secrets, double
  check parameter shape matches the placeholder count.

### Standalone-extracted packages (`spider`, `pdf`, `ocr`)

These three live in sibling repos and are extracted for *minimal
dependencies*. The SDK can depend on them, but PRs that move
heavyweight functionality *into* the SDK that conceptually belongs in
one of those packages drag the heavy deps (cheerio, happy-dom, undici,
PDF parsing, Tesseract bindings, …) into every SDK consumer. Flag any
new heavy native or runtime-only dep added under `packages/` and ask
whether it belongs in the standalone instead.

### Build, release, and consumer-impact

- **Changesets.** Explicit `.changeset/*.md` files are fine, and a
  `skip-changeset` label is the opt-out. Do not flag a missing manual
  changeset when `.github/workflows/on-pull-request.yml`'s
  `Check for Changeset` job passes by validating
  `pnpm run changeset:auto` for releaseable conventional commits. That
  auto path creates the fixed-group changeset on merge; review the
  commit subjects for accurate release notes and bump signal instead.
  Flag only when the workflow check fails, no skip label exists, or the
  commit signal/bump is wrong (`fix:` → patch, `feat:` → minor,
  `BREAKING CHANGE:` → major-treated-as-minor pre-1.0).
- **`pnpm-lock.yaml` churn.** This monorepo uses `pnpm` catalogs for
  external deps (#808). A PR that bumps a transitively-duplicated
  external dep version (e.g. adds a new copy of `undici` at a different
  version) should add to the catalog instead.
- **`turbo.json` task graph.** New scripts must declare `dependsOn`
  correctly; `build` typically depends on `^build`. CI cache hits depend
  on accurate `inputs` arrays.
- **Workspace version consistency** (#1006): all `@happyvertical/*`
  packages are version-locked. A manual `package.json` version bump in
  one package without bumping the rest will fail the consistency guard.
  Let the release workflow do it.
- **`AGENT.md` files are mostly generated** from `pnpm agent:sync`.
  The section between `<!-- BEGIN AGENT:GENERATED -->` and
  `<!-- END AGENT:GENERATED -->` markers is regenerated on every
  sync — manual hand-edits inside that section will be wiped.
  - **Both root AND per-package `AGENT.md` preserve trailing
    notes**: text AFTER the END marker is extracted via
    `extractLegacyNotes()` (`scripts/sync-agent-context.js:317`)
    and re-appended by `renderRootAgent` / `renderPackageAgent`
    (line 459 for packages, line 750 for root) on the next sync.
    Use this seam for hand-written agent guidance — slash commands,
    conventions, cross-references that the generator doesn't know
    about. (Note: `removeIfExists(legacyMetaPath)` in the
    per-package loop only deletes the optional `.claude-meta.json`
    sidecar, NOT the AGENT.md trailing notes.)
  - If the GENERATED content itself needs to change (inside the
    markers, per-package or root), the *generator* needs to change.

### Live / optional integration tests

- **`*.optional.test.ts`** files (e.g. `live-smoke.optional.test.ts` in
  social, `*.integration.test.ts` in analytics) hit real provider APIs
  with real credentials. They should:
  - Be opt-in via an env var (`ANALYTICS_LIVE=1`,
    `SOCIAL_LIVE_X_CREDS=...`).
  - Not bake in personal/dev hostnames as defaults. Recurring leak
    pattern: `https://<machine>.<tailnet>.ts.net/...` Tailscale
    magic-DNS hostnames in OAuth-callback defaults (e.g. YouTube)
    that break live smoke for any developer who isn't the one who
    set the default.
  - Use `afterAll` (with best-effort `try/finally`) for cleanup, not a
    final `it('teardown: ...')` test case — that doesn't run if an
    earlier test fails or the suite is filtered.
  - Use generic env-var names (`X_CONSUMER_KEY`, not
    `BLINDMANPRESS_CONSUMER_KEY`) so any consumer can run them.

### Author/machine path footguns

History shows leaks of `/Users/<name>/...` and other developer-
specific paths into committed test fixtures and live-smoke defaults.
Grep the diff for `/Users/`, `/home/`, `*.tail*.ts.net`, and any
obviously personal hostname; flag any hit outside `.git/` or
`node_modules/`. (Use placeholder values in examples within this
file too — the checklist asks reviewers to grep for these patterns,
so seeding the file with real ones would self-trigger.)

### Doc–code drift hot spots

- **README install instructions vs package.json**: the SDK README's
  per-package install snippets and the package's actual
  `dependencies` / `peerDependencies` / `optionalDependencies` can drift
  (e.g. README tells consumers to `pnpm add -D foo` when `foo` is
  already `optionalDependencies`). Verify when either side moves.
- **`AGENT.md` content claims** (Purpose, Requires, Stability) are
  generated and should match `package.json` and the actual surface. A
  PR that adds a new provider but leaves "supports OpenAI, Anthropic,
  …" unchanged is documentation rot.
- **Default-value claims in README / JSDoc** (`Defaults to false`)
  should match the actual default expression. Common drift: rate-limit
  `enabled` documented as defaulting to `false` while
  `hasPacingConfig` activates pacing whenever *any* pacing field is set.
- **Open-Meteo archive lag** and similar provider-quirk docs: when
  adding a new historical/archive lookup, document upstream latency
  bounds (5–7 day publishing lag, sparse stations in low-density
  regions, etc.) so consumers don't treat "no data" as a bug.

### TypeScript surface tightening

- **Decorative generics** (`async fetchJson<T>(): Promise<T>` that
  internally `return data as T`) hide the real return shape. Type the
  return concretely or actually parameterize on input.
- **Optional-chain `|| 0`** on metric fields silently turns missing data
  into zero — see analytics/weather notes above.
- **`AnalyticsInterface.admin?: AnalyticsAdminInterface`**-style
  optional sub-interfaces should have a clean detection path
  (`if (analytics.admin)`) rather than methods that throw at runtime
  when called on a non-admin provider.
