# [0.54.0](https://github.com/happyvertical/sdk/compare/v0.53.0...v0.54.0) (2025-10-31)


### Features

* **release:** initialize individual package publishing with version sync ([f8de474](https://github.com/happyvertical/sdk/commit/f8de4747f13b86ed33902bdfc6d9adc1070b4aa1))

# [0.53.0](https://github.com/happyvertical/sdk/compare/v0.52.0...v0.53.0) (2025-10-31)


### Features

* **release:** publish individual workspace packages to GitHub Packages ([def559a](https://github.com/happyvertical/sdk/commit/def559a9ae35ef9032413cdb77127675f2fa3e35))

# [0.52.0](https://github.com/happyvertical/sdk/compare/v0.51.4...v0.52.0) (2025-10-31)


### Features

* **release:** enable publishing to GitHub Packages with version protection ([ec4396f](https://github.com/happyvertical/sdk/commit/ec4396f6194f95b7a3616e8d7d15212bf217c45f))

## [0.51.4](https://github.com/happyvertical/sdk/compare/v0.51.3...v0.51.4) (2025-10-31)


### Bug Fixes

* **sql:** convert DuckDB timestamp objects to Date in queries ([6d04f4e](https://github.com/happyvertical/sdk/commit/6d04f4eabd2c15add31b377d57f6e857f5149c28)), closes [#314](https://github.com/happyvertical/sdk/issues/314) [#315](https://github.com/happyvertical/sdk/issues/315) [#314](https://github.com/happyvertical/sdk/issues/314) [#315](https://github.com/happyvertical/sdk/issues/315)

## [0.51.3](https://github.com/happyvertical/sdk/compare/v0.51.2...v0.51.3) (2025-10-30)


### Bug Fixes

* **sql:** treat undefined values as NULL in DuckDB adapter ([c14f8e2](https://github.com/happyvertical/sdk/commit/c14f8e2e98ef337e4dd9ce885166ef15cc008d4d)), closes [happyvertical/smrt#89](https://github.com/happyvertical/smrt/issues/89)

## [0.51.2](https://github.com/happyvertical/sdk/compare/v0.51.1...v0.51.2) (2025-10-29)

## [0.51.1](https://github.com/happyvertical/sdk/compare/v0.51.0...v0.51.1) (2025-10-29)


### Bug Fixes

* **sql:** handle quoted table names in CREATE TABLE regex ([acec05a](https://github.com/happyvertical/sdk/commit/acec05affe95002accc7291840401c72a82bdac9))

# [0.51.0](https://github.com/happyvertical/sdk/compare/v0.50.3...v0.51.0) (2025-10-29)


### Features

* **sql:** cache JSON adapter connections per data directory URL ([8cb144e](https://github.com/happyvertical/sdk/commit/8cb144eb7a9cd41aea8ed5261cb19d4f9a206f29)), closes [#332](https://github.com/happyvertical/sdk/issues/332) [#332](https://github.com/happyvertical/sdk/issues/332)

## [0.50.3](https://github.com/happyvertical/sdk/compare/v0.50.2...v0.50.3) (2025-10-29)


### Bug Fixes

* **sql:** fix timestamp/date inference for DuckDB and JSON adapters ([37a8a0c](https://github.com/happyvertical/sdk/commit/37a8a0cb2fe089c6077cebbf816339b451b548b4)), closes [#330](https://github.com/happyvertical/sdk/issues/330) [#330](https://github.com/happyvertical/sdk/issues/330)

## [0.50.2](https://github.com/happyvertical/sdk/compare/v0.50.1...v0.50.2) (2025-10-29)


### Bug Fixes

* **sql:** ensure syncSchema() exports empty tables to JSON files ([aa09c1f](https://github.com/happyvertical/sdk/commit/aa09c1f530ab500ab1c369147f0aed4c7384bfb7)), closes [#328](https://github.com/happyvertical/sdk/issues/328) [#328](https://github.com/happyvertical/sdk/issues/328)

## [0.50.1](https://github.com/happyvertical/sdk/compare/v0.50.0...v0.50.1) (2025-10-28)


### Bug Fixes

* **sql:** persist empty SMRT system tables in JSON adapter ([2acc934](https://github.com/happyvertical/sdk/commit/2acc934324ecc070852a460e2735a8e362d5d9f8)), closes [#328](https://github.com/happyvertical/sdk/issues/328)

# [0.50.0](https://github.com/happyvertical/sdk/compare/v0.49.1...v0.50.0) (2025-10-28)


### Bug Fixes

* **build:** correct docs package name in Turborepo filter ([3233a97](https://github.com/happyvertical/sdk/commit/3233a97b9b9c40a544731eb04c52c1938c0aed79))
* **weather:** make timeout test non-flaky ([b8f6ced](https://github.com/happyvertical/sdk/commit/b8f6ced08cedc1ff745674b4357d99c9f1532ef6))


### Features

* **ci:** migrate monorepo to Turborepo ([40ac735](https://github.com/happyvertical/sdk/commit/40ac7353c6ff6d84b98ab31465ab689350302a87)), closes [#325](https://github.com/happyvertical/sdk/issues/325)

## [0.49.1](https://github.com/happyvertical/sdk/compare/v0.49.0...v0.49.1) (2025-10-27)


### Bug Fixes

* **ai:** claude-cli provider now handles responseFormat option ([d62d51e](https://github.com/happyvertical/sdk/commit/d62d51e9cc93a8d98ee0063f8197c45d59f76e5c)), closes [#323](https://github.com/happyvertical/sdk/issues/323) [happyvertical/praeco#39](https://github.com/happyvertical/praeco/issues/39)

# [0.49.0](https://github.com/happyvertical/sdk/compare/v0.48.3...v0.49.0) (2025-10-27)


### Features

* **weather:** add weather data provider package ([4d08fa8](https://github.com/happyvertical/sdk/commit/4d08fa87cc09f9aa17d2c8642537b7acbd9cbef2))

## [0.48.3](https://github.com/happyvertical/sdk/compare/v0.48.2...v0.48.3) (2025-10-25)


### Bug Fixes

* **sql:** convert DuckDB timestamp objects to Date in JSON adapter ([2e76fb6](https://github.com/happyvertical/sdk/commit/2e76fb6c5c02a9164430e35629410493746a07cd)), closes [#319](https://github.com/happyvertical/sdk/issues/319) [#319](https://github.com/happyvertical/sdk/issues/319)
* **sql:** DuckDB schema transformation for inline UNIQUE constraints ([2d262e3](https://github.com/happyvertical/sdk/commit/2d262e33180462f862dd54f99605dc9cfc8f259a)), closes [#89](https://github.com/happyvertical/sdk/issues/89)

## [0.48.2](https://github.com/happyvertical/sdk/compare/v0.48.1...v0.48.2) (2025-10-25)


### Bug Fixes

* **sql:** convert UNIQUE indexes to inline constraints for DuckDB ([36748ae](https://github.com/happyvertical/sdk/commit/36748aef2c2e7569113ccb2100f60ca5c88647a2)), closes [#12684](https://github.com/happyvertical/sdk/issues/12684) [#316](https://github.com/happyvertical/sdk/issues/316)

## [0.48.1](https://github.com/happyvertical/sdk/compare/v0.48.0...v0.48.1) (2025-10-24)

# [0.48.0](https://github.com/happyvertical/sdk/compare/v0.47.2...v0.48.0) (2025-10-23)


### Features

* **sql:** add delete() and count() methods to DatabaseInterface ([df23096](https://github.com/happyvertical/sdk/commit/df23096066e73506539237b74c4aa9753896ddd6)), closes [#309](https://github.com/happyvertical/sdk/issues/309) [#310](https://github.com/happyvertical/sdk/issues/310)

## [0.47.2](https://github.com/happyvertical/sdk/compare/v0.47.1...v0.47.2) (2025-10-23)


### Bug Fixes

* **sql:** preserve UUID strings in DuckDB JSON export/import cycle ([cf011b3](https://github.com/happyvertical/sdk/commit/cf011b31635b44d6549607387d746a8cbd0e95d8)), closes [#306](https://github.com/happyvertical/sdk/issues/306)

## [0.47.1](https://github.com/happyvertical/sdk/compare/v0.47.0...v0.47.1) (2025-10-23)


### Bug Fixes

* **ai:** accept AIClientOptions in getAI() for backward compatibility ([00b5961](https://github.com/happyvertical/sdk/commit/00b5961c9af0265072b397704bafb519a0498fc1)), closes [#303](https://github.com/happyvertical/sdk/issues/303)
* **sql:** validate conflict columns in upsert operations ([cb83cba](https://github.com/happyvertical/sdk/commit/cb83cbac0927f9580ade6720a787a74c7796eccf)), closes [#301](https://github.com/happyvertical/sdk/issues/301) [#301](https://github.com/happyvertical/sdk/issues/301)

# [0.47.0](https://github.com/happyvertical/sdk/compare/v0.46.0...v0.47.0) (2025-10-22)


### Features

* **ci:** add issue templates with SOP checklists ([202bbfe](https://github.com/happyvertical/sdk/commit/202bbfe5b2823e78aaef0f65b6ada226d7cdf6ce)), closes [#299](https://github.com/happyvertical/sdk/issues/299)
* **sql:** add SchemaProvider pattern to eliminate circular dependency ([68ab4a9](https://github.com/happyvertical/sdk/commit/68ab4a9d59547fcaf1532853107b464076199f86)), closes [#298](https://github.com/happyvertical/sdk/issues/298)

# [0.46.0](https://github.com/happyvertical/sdk/compare/v0.45.4...v0.46.0) (2025-10-21)


### Bug Fixes

* **build:** resolve TypeScript compilation errors in github-actions, utils, and sql packages ([065debd](https://github.com/happyvertical/sdk/commit/065debdbd867fe999b86dff22c1e2e4bb5d457cd)), closes [#296](https://github.com/happyvertical/sdk/issues/296)
* **ci:** convert triage script to ES module syntax ([85900a3](https://github.com/happyvertical/sdk/commit/85900a37604c2e11a45f30394ca3d570d517ceca))
* **ci:** disable npm publishing in semantic-release ([6e628ad](https://github.com/happyvertical/sdk/commit/6e628ad91ca8b36f6daf2c641d3e2797fd260ffa)), closes [#293](https://github.com/happyvertical/sdk/issues/293)
* **ci:** use GH_TOKEN for triage workflow ([cd9714b](https://github.com/happyvertical/sdk/commit/cd9714b56cc6c60470c7f58721a48aacc0a83047))
* **release:** update vite external packages from [@have](https://github.com/have) to [@happyvertical](https://github.com/happyvertical) ([7c97003](https://github.com/happyvertical/sdk/commit/7c970037922b89b4f55307b24b2bd7d2c5a36ab2))


### Features

* **ci:** cancel PR validation on merge ([1bd1499](https://github.com/happyvertical/sdk/commit/1bd149955e5f5c1d9e4452e938ea7c7e443f8028)), closes [#289](https://github.com/happyvertical/sdk/issues/289)
* **ci:** centralize issue triage automation across HappyVertical repos ([84747c3](https://github.com/happyvertical/sdk/commit/84747c370623dd06fdbfd7b2f0d5b0e05a486cd0)), closes [#291](https://github.com/happyvertical/sdk/issues/291)
* **ci:** implement AI-powered issue triage automation ([605e295](https://github.com/happyvertical/sdk/commit/605e2952f3cfd0790a0edbc0b62f2105597ef083)), closes [#284](https://github.com/happyvertical/sdk/issues/284)
* **release:** enable automated publishing to GitHub Packages ([7fd7107](https://github.com/happyvertical/sdk/commit/7fd7107920033fa83acffee5c12b5fb5b3e98822)), closes [#281](https://github.com/happyvertical/sdk/issues/281)

## [0.45.4](https://github.com/happyvertical/sdk/compare/v0.45.3...v0.45.4) (2025-10-21)


### Bug Fixes

* **ci:** exclude docs package from recursive builds ([74a1562](https://github.com/happyvertical/sdk/commit/74a156271d5fd94f93032f646b9c88583786a173)), closes [happyvertical/smrt#43](https://github.com/happyvertical/smrt/issues/43)

## [0.45.3](https://github.com/happyvertical/sdk/compare/v0.45.2...v0.45.3) (2025-10-21)

## [0.45.2](https://github.com/happyvertical/sdk/compare/v0.45.1...v0.45.2) (2025-10-20)

## [0.45.1](https://github.com/happyvertical/sdk/compare/v0.45.0...v0.45.1) (2025-10-20)


### Bug Fixes

* **sql:** add table name validation to JSON adapter methods ([b8b2291](https://github.com/happyvertical/sdk/commit/b8b2291d0935f09ef8f648823c90808308a20324)), closes [#267](https://github.com/happyvertical/sdk/issues/267)

# [0.45.0](https://github.com/happyvertical/sdk/compare/v0.44.1...v0.45.0) (2025-10-20)


### Features

* **config:** add sdk-mcp server for package documentation queries ([704907a](https://github.com/happyvertical/sdk/commit/704907a578d43e39dda994abedc3feafedd93d0e)), closes [#237](https://github.com/happyvertical/sdk/issues/237)

## [0.44.1](https://github.com/happyvertical/sdk/compare/v0.44.0...v0.44.1) (2025-10-20)


### Bug Fixes

* **spider:** disable useNamingConvention to avoid biome crash ([3b9d8a5](https://github.com/happyvertical/sdk/commit/3b9d8a51de624b75daed4d337dd77247fa541edb))

# [0.44.0](https://github.com/happyvertical/sdk/compare/v0.43.1...v0.44.0) (2025-10-20)


### Bug Fixes

* **ai:** add afterEach import and normalize model to defaultModel ([30ddc9d](https://github.com/happyvertical/sdk/commit/30ddc9dc870cba74f7ac89fe0fd0d43c2a861db5))
* **ai:** skip Claude CLI integration tests by default ([ebb4441](https://github.com/happyvertical/sdk/commit/ebb4441840f41c8b7044f265a4b4579e8dc67f13))
* **ai:** use options consistently instead of mixing config and options variables ([5b357c3](https://github.com/happyvertical/sdk/commit/5b357c3bb673fe839f583ffac7fee7eec9c3127c))
* **sql:** ensure options object mutation for dbid propagation ([b20c061](https://github.com/happyvertical/sdk/commit/b20c06121d0ab058d17a823951282b927fd90438))
* **translator:** skip LibreTranslate integration tests by default ([36e3f54](https://github.com/happyvertical/sdk/commit/36e3f548af8eadf91af50109b05e0c5ab7429856))
* **utils:** use allowUnknown: false in env-config tests to avoid CI environment pollution ([f82e381](https://github.com/happyvertical/sdk/commit/f82e381324796d1e297789aff9484c2805d53e15))


### Features

* **ai:** add claude-cli provider for Claude Max subscription usage ([af5776a](https://github.com/happyvertical/sdk/commit/af5776ab82db97d15710df97305ff111632bf352)), closes [#254](https://github.com/happyvertical/sdk/issues/254)
* **config:** add environment variable configuration support ([0d4bc00](https://github.com/happyvertical/sdk/commit/0d4bc00b2c7a13df9d5b560c1619d0c151799f77)), closes [#258](https://github.com/happyvertical/sdk/issues/258) [#258](https://github.com/happyvertical/sdk/issues/258)

## [0.43.1](https://github.com/happyvertical/sdk/compare/v0.43.0...v0.43.1) (2025-10-18)


### Bug Fixes

* **ci:** use OAuth token for auto-fix workflow ([d30c912](https://github.com/happyvertical/sdk/commit/d30c912a5ede6040f7f86b11004d40a8a3e9736d))
* **sql:** skip undefined values in serializeRecord ([b832a5b](https://github.com/happyvertical/sdk/commit/b832a5bf3660b6439c92a2604dbc90fee8a3246a))

# [0.43.0](https://github.com/happyvertical/sdk/compare/v0.42.0...v0.43.0) (2025-10-17)


### Features

* **sql:** add dbid parameter for memory database connection sharing ([824ec99](https://github.com/happyvertical/sdk/commit/824ec99284b8cdca87c3c112466921f9d45c5b7a)), closes [#249](https://github.com/happyvertical/sdk/issues/249) [#249](https://github.com/happyvertical/sdk/issues/249)

# [0.42.0](https://github.com/happyvertical/sdk/compare/v0.41.1...v0.42.0) (2025-10-17)


* refactor!: remove 'I' prefix from interface names ([bd6d6c5](https://github.com/happyvertical/sdk/commit/bd6d6c50035acbaca5bb5cf271138bb31b29aa20))


### Bug Fixes

* **ci:** remove invalid markdown.hooks configuration from Docusaurus ([d00d25d](https://github.com/happyvertical/sdk/commit/d00d25db0b6a9f9bd530eca00196bbe66d1bd102))
* **ci:** remove unsupported regex pattern from Biome naming convention ([592dee1](https://github.com/happyvertical/sdk/commit/592dee155132b391b940cb3bee73c65856518417))


### BREAKING CHANGES

* All interface names have been updated:
- ICacheProvider → CacheProvider
- ICacheAdapter → CacheAdapter
- IGeoProvider → GeoProvider
- IGeoAdapter → GeoAdapter
- ISignalAdapter → SignalAdapter
- ITranslationProvider → TranslationProvider
- ITranslator → Translator
- ISpiderAdapter → SpiderAdapter
- IScraper → Scraper

Changes include:
- Created STYLE_GUIDE.md with TypeScript naming conventions
- Configured Biome linter with useNamingConvention rule
- Updated all interface definitions and implementations
- Updated all imports and type references
- All tests pass (497/501, 4 unrelated API failures)
- All packages build successfully

## [0.41.1](https://github.com/happyvertical/sdk/compare/v0.41.0...v0.41.1) (2025-10-17)

# [0.41.0](https://github.com/happyvertical/sdk/compare/v0.40.0...v0.41.0) (2025-10-16)


### Features

* **sql:** standardize ALTER TABLE methods across database adapters ([49d8f13](https://github.com/happyvertical/sdk/commit/49d8f138913e1f7a2c5fb6a26eab3896724e7b07)), closes [#241](https://github.com/happyvertical/sdk/issues/241) [#241](https://github.com/happyvertical/sdk/issues/241)

# [0.40.0](https://github.com/happyvertical/sdk/compare/v0.39.0...v0.40.0) (2025-10-16)


### Features

* **ci:** add auto-fix workflow for PR failures ([297ffc8](https://github.com/happyvertical/sdk/commit/297ffc872b55653b9e43c82d63478ab51251bd0e))

# [0.39.0](https://github.com/happyvertical/sdk/compare/v0.38.0...v0.39.0) (2025-10-16)


### Bug Fixes

* **docs:** remove references to split SMRT packages ([0858d39](https://github.com/happyvertical/sdk/commit/0858d398b00a1f0814a2326093f02f894095ceba)), closes [#238](https://github.com/happyvertical/sdk/issues/238)

# [0.38.0](https://github.com/happyvertical/sdk/compare/v0.37.1...v0.38.0) (2025-10-16)


### Bug Fixes

* **build:** fix SDK build after SMRT framework split ([e895ca8](https://github.com/happyvertical/sdk/commit/e895ca871166d385388a88865e09fda7369ec5e1))
* **ci:** remove SMRT package verification step ([7b52b28](https://github.com/happyvertical/sdk/commit/7b52b28131b4661a52a79893876f95a489c61740))
* **deps:** remove @happyvertical/types dependency from logger and config packages ([1b00c9d](https://github.com/happyvertical/sdk/commit/1b00c9dcc8ecec1fceb206126504e013b4e9829e))
* **lint:** resolve linting errors by fixing code issues ([51f3d2f](https://github.com/happyvertical/sdk/commit/51f3d2f0b0f1b4818f0f854598838932dbc0f8b5))
* **smrt:** add CAST to DEFAULT values in runtime-manager schema generation ([a9a883a](https://github.com/happyvertical/sdk/commit/a9a883a4bca6daf39a10298506a36ae514d6c508)), closes [#228](https://github.com/happyvertical/sdk/issues/228) [#229](https://github.com/happyvertical/sdk/issues/229) [#230](https://github.com/happyvertical/sdk/issues/230) [#229](https://github.com/happyvertical/sdk/issues/229) [#230](https://github.com/happyvertical/sdk/issues/230)
* **smrt:** add explicit CAST to DEFAULT values for DuckDB type inference ([47b6fbb](https://github.com/happyvertical/sdk/commit/47b6fbbf19848f2a364b84a72e47e890224c2b63)), closes [#228](https://github.com/happyvertical/sdk/issues/228)
* **sql:** cast empty string parameters in json adapter insert/upsert ([5262e7f](https://github.com/happyvertical/sdk/commit/5262e7f2a6c0ae1be5dc98111f0bb1f50b6333a0)), closes [#228](https://github.com/happyvertical/sdk/issues/228) [#229](https://github.com/happyvertical/sdk/issues/229) [#230](https://github.com/happyvertical/sdk/issues/230) [#231](https://github.com/happyvertical/sdk/issues/231) [#228](https://github.com/happyvertical/sdk/issues/228)
* **sql:** prevent DuckDB type re-inference during JSON data loading ([d6389e2](https://github.com/happyvertical/sdk/commit/d6389e2c272cf595a78381dc134acf0b27024756)), closes [#228](https://github.com/happyvertical/sdk/issues/228) [#230](https://github.com/happyvertical/sdk/issues/230) [#233](https://github.com/happyvertical/sdk/issues/233)
* **test:** update vitest config after SMRT framework split ([bc7abf8](https://github.com/happyvertical/sdk/commit/bc7abf84946db92c9a0a82220fae012be8ddb269))
* **workspace:** update pnpm workspace and lockfile ([614b47d](https://github.com/happyvertical/sdk/commit/614b47d068f6d01e5555cc45791c63e7e8428441))


### Features

* **sql:** fix DuckDB type inference issues in JSON adapter ([2419cba](https://github.com/happyvertical/sdk/commit/2419cbae6fd1ee951500dfe81b26f930ace44038)), closes [#235](https://github.com/happyvertical/sdk/issues/235) [#228](https://github.com/happyvertical/sdk/issues/228) [#225](https://github.com/happyvertical/sdk/issues/225) [#235](https://github.com/happyvertical/sdk/issues/235)

## [0.37.1](https://github.com/happyvertical/sdk/compare/v0.37.0...v0.37.1) (2025-10-16)


### Bug Fixes

* **sql:** explicitly cast DEFAULT values in SMRT schemas to prevent DuckDB ANY type inference ([f6b29bf](https://github.com/happyvertical/sdk/commit/f6b29bfddc1f810b8f90064a708a9f6872a40a0c)), closes [#228](https://github.com/happyvertical/sdk/issues/228)

# [0.37.0](https://github.com/happyvertical/sdk/compare/v0.36.0...v0.37.0) (2025-10-15)


### Features

* **sql:** integrate JSON adapter with SMRT ObjectRegistry for proper type inference ([14dc3c6](https://github.com/happyvertical/sdk/commit/14dc3c6d7542914dd0b11786287eb0abc6cd1e90)), closes [#228](https://github.com/happyvertical/sdk/issues/228)

# [0.36.0](https://github.com/happyvertical/sdk/compare/v0.35.0...v0.36.0) (2025-10-15)


### Features

* **sql:** add per-adapter upsert() method to fix DuckDB compatibility ([f817d81](https://github.com/happyvertical/sdk/commit/f817d81e15beccbe0c99d9c1fd4521d7ebb09d98)), closes [#226](https://github.com/happyvertical/sdk/issues/226) [#226](https://github.com/happyvertical/sdk/issues/226) [#226](https://github.com/happyvertical/sdk/issues/226)

# [0.35.0](https://github.com/happyvertical/sdk/compare/v0.34.0...v0.35.0) (2025-10-15)


### Features

* **sql:** add JSON adapter with in-memory DuckDB engine ([3a4883d](https://github.com/happyvertical/sdk/commit/3a4883d96fdc3d130b4099b2cdf313b89fd1136f)), closes [#224](https://github.com/happyvertical/sdk/issues/224) [#224](https://github.com/happyvertical/sdk/issues/224)

# [0.34.0](https://github.com/happyvertical/sdk/compare/v0.33.0...v0.34.0) (2025-10-15)

# [0.33.0](https://github.com/happyvertical/sdk/compare/v0.32.2...v0.33.0) (2025-10-15)


### Bug Fixes

* **smrt:** use UUID-based primary keys for database-agnostic system tables ([c5f4db2](https://github.com/happyvertical/sdk/commit/c5f4db298427bcdf4077940bba0276a4d61ab325)), closes [#220](https://github.com/happyvertical/sdk/issues/220)


### Features

* **sql:** add DuckDB adapter with JSON file support ([f993725](https://github.com/happyvertical/sdk/commit/f993725b388ab181d4c3ba4335211e062154d43e))

## [0.32.2](https://github.com/happyvertical/sdk/compare/v0.32.1...v0.32.2) (2025-10-14)

## [0.32.1](https://github.com/happyvertical/sdk/compare/v0.32.0...v0.32.1) (2025-10-14)


### Bug Fixes

* **smrt:** use item class instead of collection class for table name ([b43b6d8](https://github.com/happyvertical/sdk/commit/b43b6d85542de1808e43d7034f31503292762b81)), closes [#218](https://github.com/happyvertical/sdk/issues/218)

# [0.32.0](https://github.com/happyvertical/sdk/compare/v0.31.0...v0.32.0) (2025-10-14)


### Bug Fixes

* **build:** eliminate numbered intermediate dist files ([6e70c4e](https://github.com/happyvertical/sdk/commit/6e70c4eb3cdee386306906b62d2bccb65fde82c5))

# [0.31.0](https://github.com/happyvertical/sdk/compare/v0.30.0...v0.31.0) (2025-10-14)


### Features

* **utils:** add web utility functions for URL handling ([0eef7e5](https://github.com/happyvertical/sdk/commit/0eef7e5dff5d2a62deaf20be68fd445449b9c5b3))

# [0.30.0](https://github.com/happyvertical/sdk/compare/v0.29.0...v0.30.0) (2025-10-14)


### Bug Fixes

* **agents:** use in-memory database for tests ([a46ab11](https://github.com/happyvertical/sdk/commit/a46ab111eded3b4bd9bcad6141f66a6f386e3550))
* **agents:** use url instead of filename for database config ([accbeb8](https://github.com/happyvertical/sdk/commit/accbeb8b69e0d536e35c2adbd108a201c03cfd36)), closes [#214](https://github.com/happyvertical/sdk/issues/214)


### Features

* **smrt:** remove persistence layer, enable direct db access ([da3f435](https://github.com/happyvertical/sdk/commit/da3f435b87c1f1dde898dcf0ba97dd4da4fc11b9)), closes [#203](https://github.com/happyvertical/sdk/issues/203) [#214](https://github.com/happyvertical/sdk/issues/214)

# [0.29.0](https://github.com/happyvertical/sdk/compare/v0.28.0...v0.29.0) (2025-10-14)


### Bug Fixes

* **smrt:** run MCP advisor directly via pnpm exec tsx without bridge script ([fe98301](https://github.com/happyvertical/sdk/commit/fe98301d822d42658fc7fba972c1056ad815c01d))
* **smrt:** use pnpm exec tsx for MCP advisor server to avoid global dependency ([02fb46a](https://github.com/happyvertical/sdk/commit/02fb46a7963e46bc21e564c67e58aec58c045b6c))


### Features

* **smrt:** implement SMRT Framework Advisor MCP server with 11 development tools ([fd0e169](https://github.com/happyvertical/sdk/commit/fd0e1699b9a1d29615fb2e8757df0d0cc65f8cf0)), closes [#210](https://github.com/happyvertical/sdk/issues/210) [#209](https://github.com/happyvertical/sdk/issues/209) [#209](https://github.com/happyvertical/sdk/issues/209) [#209](https://github.com/happyvertical/sdk/issues/209) [#210](https://github.com/happyvertical/sdk/issues/210)

# [0.28.0](https://github.com/happyvertical/sdk/compare/v0.27.1...v0.28.0) (2025-10-14)


### Bug Fixes

* **ai:** support all AI providers beyond OpenAI in AIClient.create() ([09618c6](https://github.com/happyvertical/sdk/commit/09618c6436edcba0fe2b7493c4c501eda7929501)), closes [#202](https://github.com/happyvertical/sdk/issues/202)
* **build:** remove @happyvertical/notes from build order ([59acc85](https://github.com/happyvertical/sdk/commit/59acc854bdfd32498ed348cc8b2c6bc7a3152a55))
* **documents:** generate valid cache paths for URLs with query parameters ([b6db005](https://github.com/happyvertical/sdk/commit/b6db005c94aa7b9eb0c926623afd030554a2d5e5)), closes [#189](https://github.com/happyvertical/sdk/issues/189)
* **smrt:** add missing entry point files for package exports ([04cf008](https://github.com/happyvertical/sdk/commit/04cf008312747f0b721bd92153a181288293ea00)), closes [#212](https://github.com/happyvertical/sdk/issues/212)
* **smrt:** generate JavaScript files for vite-plugin, prebuild, and consumer-plugin entry points ([347b42e](https://github.com/happyvertical/sdk/commit/347b42e2ac113c395de3bed78c6fb065d7041e2e)), closes [#204](https://github.com/happyvertical/sdk/issues/204)
* **smrt:** migrate DatabaseInterface method calls to new API ([8f19c26](https://github.com/happyvertical/sdk/commit/8f19c26b2731c86a367cd2f74036d115d82c2f22))
* **smrt:** resolve entry point JavaScript file generation in build ([54ac296](https://github.com/happyvertical/sdk/commit/54ac296d5aabca88fadbb3e59f735a25720e4c49)), closes [#204](https://github.com/happyvertical/sdk/issues/204)
* **smrt:** suppress TypeScript errors for optional @happyvertical/notes imports ([1b2ac6b](https://github.com/happyvertical/sdk/commit/1b2ac6b149c8ede3b828148b945449c22e6d756c))
* **spider:** add crawlee to external dependencies in vite config ([13a77cf](https://github.com/happyvertical/sdk/commit/13a77cfd70782f9bb807e00b721f51b3e9624e4e)), closes [#187](https://github.com/happyvertical/sdk/issues/187)
* **spider:** decode HTML entities in WordPress Download Manager URLs ([354ec27](https://github.com/happyvertical/sdk/commit/354ec276cc725fb2c374e02a5fda856ae3640c06)), closes [#184](https://github.com/happyvertical/sdk/issues/184) [#039](https://github.com/happyvertical/sdk/issues/039) [#184](https://github.com/happyvertical/sdk/issues/184)
* **spider:** detect WordPress downloads by wpdmdl param not .pdf extension ([a19c2a2](https://github.com/happyvertical/sdk/commit/a19c2a2023e750fa12ca8744e1e56231bf115a1c)), closes [#181](https://github.com/happyvertical/sdk/issues/181)
* **spider:** prevent re-download of PDFs from WordPress pages ([8b7ba15](https://github.com/happyvertical/sdk/commit/8b7ba15ef934311d198887b450ead65d452a40a3)), closes [#179](https://github.com/happyvertical/sdk/issues/179)
* **sql:** correct client.execute() API usage for LibSQL ([570508c](https://github.com/happyvertical/sdk/commit/570508c3b3ce8724867a9a80b84c7eb25ec3a38a)), closes [#211](https://github.com/happyvertical/sdk/issues/211)


### Features

* **build:** consolidate vite configs and fix smrt multi-entry build ([04058f4](https://github.com/happyvertical/sdk/commit/04058f46bb177deae3ffa573291829a1cf0dbddd)), closes [#211](https://github.com/happyvertical/sdk/issues/211) [#208](https://github.com/happyvertical/sdk/issues/208) [#211](https://github.com/happyvertical/sdk/issues/211)
* **ci:** auto-trigger Claude on blocker label for urgent issue resolution ([cd7d875](https://github.com/happyvertical/sdk/commit/cd7d87526089e6c8f3d37170d46ae136c528b31a))
* **ci:** enhance Claude Code workflow with full PR creation capabilities ([9fad4c2](https://github.com/happyvertical/sdk/commit/9fad4c254d5cf4a4d7c289939544cdc087c6e15d))
* **content:** add variant field for namespaced content classification ([b60beea](https://github.com/happyvertical/sdk/commit/b60beeacb805d08c234361dad4b2bb0714c3361e)), closes [#200](https://github.com/happyvertical/sdk/issues/200)
* **registry:** add convenience methods and comprehensive documentation ([cec1488](https://github.com/happyvertical/sdk/commit/cec1488391abf1f9616d96ac44f50c2224c86d1f)), closes [#211](https://github.com/happyvertical/sdk/issues/211) [#211](https://github.com/happyvertical/sdk/issues/211)
* **smrt:** complete MCP server generation with runtime bootstrap and stdio transport ([edf22b7](https://github.com/happyvertical/sdk/commit/edf22b756aead473b00547fbb3a69112aa7447af)), closes [#209](https://github.com/happyvertical/sdk/issues/209) [#209](https://github.com/happyvertical/sdk/issues/209)
* **smrt:** integrate note-taking system into core with system tables ([f080a67](https://github.com/happyvertical/sdk/commit/f080a6729237eba0f08bffc560820e1d2604e8d7))
* **spider:** add CivicWeb preview page detection to scrapeDocument ([f47d3cb](https://github.com/happyvertical/sdk/commit/f47d3cb514cc8d76f5466d183dc86f0d50d6bda6)), closes [#193](https://github.com/happyvertical/sdk/issues/193)
* **spider:** add DocuShare document page detection to scrapeDocument ([2cb7eac](https://github.com/happyvertical/sdk/commit/2cb7eacad13c52494cd3786224bbd8ef69625185))
* **spider:** add scraper and spider configuration options to scrapeDocument ([750e487](https://github.com/happyvertical/sdk/commit/750e487f32e39eaa65273bd42e49ef76b57e0841)), closes [#195](https://github.com/happyvertical/sdk/issues/195)
* **spider:** add WordPress download manager support to scrapeDocument ([4c2aa0a](https://github.com/happyvertical/sdk/commit/4c2aa0afbf50f2189d16bce756377d1d3f60f0ce)), closes [#177](https://github.com/happyvertical/sdk/issues/177)
* **utils:** add support for underscore and dot date formats to dateInString ([3dedc02](https://github.com/happyvertical/sdk/commit/3dedc020758ac9570c913d47669407f0f8dbce50)), closes [#191](https://github.com/happyvertical/sdk/issues/191)
* **utils:** enhance dateInString to support multiple date formats ([ce31195](https://github.com/happyvertical/sdk/commit/ce31195e01830ad05bc72ec141b32b0698a708e1))


### BREAKING CHANGES

* **smrt:** @happyvertical/notes package removed - functionality now built into @happyvertical/smrt

## [0.27.1](https://github.com/happyvertical/sdk/compare/v0.27.0...v0.27.1) (2025-10-12)


### Bug Fixes

* **documents, utils:** enhance PDF detection and CLI parser ([#174](https://github.com/happyvertical/sdk/issues/174), [#168](https://github.com/happyvertical/sdk/issues/168), [#175](https://github.com/happyvertical/sdk/issues/175)) ([327e63f](https://github.com/happyvertical/sdk/commit/327e63fd3f2beda592ce9b78f148e5b02fa4849a))


### Performance Improvements

* **ci:** add caching for Playwright browsers and build artifacts ([4f4b042](https://github.com/happyvertical/sdk/commit/4f4b0420462a8a6f4cf045d427b2ba039453eb6a))

# [0.27.0](https://github.com/happyvertical/sdk/compare/v0.26.0...v0.27.0) (2025-10-12)


### Bug Fixes

* **spider:** resolve build errors after TreeHarvester rename ([76be123](https://github.com/happyvertical/sdk/commit/76be123abe77bdaf2ee9cd10376579dfef7f5007))


### Features

* **spider:** add caching and rate limiting to TreeScraper ([6ba07b6](https://github.com/happyvertical/sdk/commit/6ba07b62672780cf1945008d671d99c1617e2388)), closes [#172](https://github.com/happyvertical/sdk/issues/172)
* **spider:** add harvester architecture for content extraction strategies ([21ec483](https://github.com/happyvertical/sdk/commit/21ec483bda3998161f0cd45f4a4018f4c77ddabf))
* **spider:** add integration tests and improve AccordionHarvester for hierarchical structures ([e536131](https://github.com/happyvertical/sdk/commit/e536131d0dd0266f2aafb65bab6e4ba1c8c6b49f))
* **spider:** rename harvest → scrape and add convenience functions ([e07da83](https://github.com/happyvertical/sdk/commit/e07da8310717fdd2fccd81903c01f97efae36450))


### BREAKING CHANGES

* **spider:** Rename all harvest terminology to industry-standard scrape terminology

- Rename types: HarvestResult → ScrapeResult, HarvestOptions → ScrapeOptions, etc.
- Rename factory: harvester-factory.ts → scraper-factory.ts
- Rename directory: harvesters/ → scrapers/
- Rename classes: BasicHarvester → BasicScraper, TreeHarvester → TreeScraper
- Update discriminator: harvester: 'basic' → scraper: 'basic'
- Update all method names: .harvest() → .scrape()
- Update all test files with new terminology

NEW: Add convenience functions for common use cases
- scrapeIndex(): High-level function for extracting link indexes
- scrapeDocument(): Smart document content extraction with type detection
- findDocumentLinks(): Helper to find downloadable documents on a page

Test results: ✅ 36 tests passing (2 skipped)
Build results: ✅ Package builds successfully

# [0.26.0](https://github.com/happyvertical/sdk/compare/v0.25.0...v0.26.0) (2025-10-11)


### Features

* **spider:** add comprehensive link metadata extraction ([281c394](https://github.com/happyvertical/sdk/commit/281c394fccf931c557c862cd655c64efc3157fae))

# [0.25.0](https://github.com/happyvertical/sdk/compare/v0.24.2...v0.25.0) (2025-10-11)

## [0.24.2](https://github.com/happyvertical/sdk/compare/v0.24.1...v0.24.2) (2025-10-11)


### Bug Fixes

* **spider:** correct cheerio ESM import with interop setting ([5f5c433](https://github.com/happyvertical/sdk/commit/5f5c433c557bcfedaace4467de1d09786c868529)), closes [#166](https://github.com/happyvertical/sdk/issues/166)

## [0.24.1](https://github.com/happyvertical/sdk/compare/v0.24.0...v0.24.1) (2025-10-11)


### Bug Fixes

* **content:** correct build entry point and remove fetchDocument re-export ([62dde14](https://github.com/happyvertical/sdk/commit/62dde14011ef7d203d6d227d35e8a440a4ab08c9)), closes [#162](https://github.com/happyvertical/sdk/issues/162)

# [0.24.0](https://github.com/happyvertical/sdk/compare/v0.23.1...v0.24.0) (2025-10-11)


### Bug Fixes

* **build:** add @happyvertical/documents to build order ([4fc2b70](https://github.com/happyvertical/sdk/commit/4fc2b705d0d4acdde554ee23270c6662a2998189)), closes [#163](https://github.com/happyvertical/sdk/issues/163)
* **build:** add @happyvertical/documents to vite configuration ([e2dfdc8](https://github.com/happyvertical/sdk/commit/e2dfdc89f09e86336bea8f4de56ca09e194d18db))
* **content:** remove custom create() method from Contents class ([96b9f39](https://github.com/happyvertical/sdk/commit/96b9f3957bea135e8809accc7d431ee1c39303b4))


### Features

* **documents:** add @happyvertical/documents package for multi-part document processing ([72a23bb](https://github.com/happyvertical/sdk/commit/72a23bb1350a296e2bbab639ebf482d173ffe803)), closes [#162](https://github.com/happyvertical/sdk/issues/162)

## [0.23.1](https://github.com/happyvertical/sdk/compare/v0.23.0...v0.23.1) (2025-10-10)


### Bug Fixes

* **smrt:** integrate getAI factory for multi-provider support ([07afe96](https://github.com/happyvertical/sdk/commit/07afe96c50d602c6b9157fbfbeab1d283fad32ae)), closes [#159](https://github.com/happyvertical/sdk/issues/159)

# [0.23.0](https://github.com/happyvertical/sdk/compare/v0.22.0...v0.23.0) (2025-10-10)


### Features

* **utils:** add code extraction and safe execution utilities ([9921657](https://github.com/happyvertical/sdk/commit/9921657183aa5b88ae4859c631f6479d12a329a9)), closes [#158](https://github.com/happyvertical/sdk/issues/158) [#158](https://github.com/happyvertical/sdk/issues/158)

# [0.22.0](https://github.com/happyvertical/sdk/compare/v0.21.0...v0.22.0) (2025-10-10)


### Bug Fixes

* **ai:** improve type safety and error handling in AI providers ([a2f990f](https://github.com/happyvertical/sdk/commit/a2f990ff5683e13bffba0ee3f5a5cd71b531dd00))
* **ai:** update Gemini provider for @google/genai SDK compatibility ([1273455](https://github.com/happyvertical/sdk/commit/12734553fa8747e8a99a9e34c060ed6ef972fa6a))


### Features

* **ai:** add tool use and structured output support to all providers ([d87f577](https://github.com/happyvertical/sdk/commit/d87f577dfa394a723d3a33cff2205b815f863c89)), closes [#157](https://github.com/happyvertical/sdk/issues/157)

# [0.21.0](https://github.com/happyvertical/sdk/compare/v0.20.5...v0.21.0) (2025-10-09)


### Bug Fixes

* **notes:** address code review comments ([be04be6](https://github.com/happyvertical/sdk/commit/be04be6bdfdc71fc756078ab4ba3e82906f8727f))
* **notes:** enable integration test by using direct imports ([0cbafa1](https://github.com/happyvertical/sdk/commit/0cbafa1b0f44bcd8c452b30320ca8e45586cd013))
* **notes:** pass collection options when creating Note instances in note() method ([b1fda55](https://github.com/happyvertical/sdk/commit/b1fda5594467665d916ac4818f63fbbb255b4ded))
* **notes:** properly pass options to create() instead of instance ([d7b2369](https://github.com/happyvertical/sdk/commit/d7b2369de432bd20e3dc5c5e5a960862ba3057b6))
* **notes:** rename lastUsed to lastUsedAt for proper DATETIME support ([6c3f5cd](https://github.com/happyvertical/sdk/commit/6c3f5cd1618b08aaa6d88a011c487907cd9c0c98)), closes [#149](https://github.com/happyvertical/sdk/issues/149)
* **notes:** save Note instances to database in note() method ([6bb9513](https://github.com/happyvertical/sdk/commit/6bb95136f4034a33b6bab138a4d525f44e881c13))
* **notes:** update tests to use static factory pattern for NoteCollection ([e95292e](https://github.com/happyvertical/sdk/commit/e95292e921f2f5ccd2475bfe3b2ad9324fe2a461))
* **smrt:** strip hyphens from UUID-based slugs to avoid UUID regex matching ([6ce5126](https://github.com/happyvertical/sdk/commit/6ce5126ccef45ca262829ca116e747e1a211ce90))
* **smrt:** use ID as fallback for slug generation when name is not provided ([28bb171](https://github.com/happyvertical/sdk/commit/28bb171550201e36967a98eedff0c0e67ffe7adf))


### Features

* **notes:** add hierarchical note-taking module for SMRT objects ([f328935](https://github.com/happyvertical/sdk/commit/f3289355dd6a0eaff76b715fee2e519eae50a722)), closes [#149](https://github.com/happyvertical/sdk/issues/149)

## [0.20.5](https://github.com/happyvertical/sdk/compare/v0.20.4...v0.20.5) (2025-10-09)


### Bug Fixes

* CLI auto-generation improvements ([da3cfd3](https://github.com/happyvertical/sdk/commit/da3cfd38658b04e30d2aa04a695d6e6f8c591f07)), closes [#149](https://github.com/happyvertical/sdk/issues/149) [#151](https://github.com/happyvertical/sdk/issues/151)

## [0.20.4](https://github.com/happyvertical/sdk/compare/v0.20.3...v0.20.4) (2025-10-09)


### Bug Fixes

* **assets:** replace deprecated objectClass with _itemClass ([5764588](https://github.com/happyvertical/sdk/commit/57645885ec91ad52dd492f0b23d7eb97d61d3259)), closes [#146](https://github.com/happyvertical/sdk/issues/146)

## [0.20.3](https://github.com/happyvertical/sdk/compare/v0.20.2...v0.20.3) (2025-10-09)


### Bug Fixes

* **smrt:** lazy-load gnode and generate commands in CLIGenerator ([1170d4c](https://github.com/happyvertical/sdk/commit/1170d4cd1e82068dd0e4758f3e2bbccb8df93474)), closes [#151](https://github.com/happyvertical/sdk/issues/151)

## [0.20.2](https://github.com/happyvertical/sdk/compare/v0.20.1...v0.20.2) (2025-10-09)


### Bug Fixes

* **smrt:** replace TypeScript import with JSDoc in @smrt/cli virtual module ([1e9844f](https://github.com/happyvertical/sdk/commit/1e9844fa14d37d7d0d8548c047c2a2af34425241)), closes [#149](https://github.com/happyvertical/sdk/issues/149)

## [0.20.1](https://github.com/happyvertical/sdk/compare/v0.20.0...v0.20.1) (2025-10-09)

# [0.20.0](https://github.com/happyvertical/sdk/compare/v0.19.2...v0.20.0) (2025-10-09)


### Features

* **smrt:** add @smrt/cli virtual module for auto-generated CLI ([ab49c44](https://github.com/happyvertical/sdk/commit/ab49c44405b97dfc3f9adea974be8fd7d23da9d7)), closes [#147](https://github.com/happyvertical/sdk/issues/147)

## [0.19.2](https://github.com/happyvertical/sdk/compare/v0.19.1...v0.19.2) (2025-10-08)


### Bug Fixes

* **smrt:** prevent duplicate timestamp columns in schema generation ([270485f](https://github.com/happyvertical/sdk/commit/270485f67d749d82dd1e56822f902c2be3f57726)), closes [#144](https://github.com/happyvertical/sdk/issues/144)

## [0.19.1](https://github.com/happyvertical/sdk/compare/v0.19.0...v0.19.1) (2025-10-08)


### Bug Fixes

* **smrt:** resolve foreign key circular dependencies with lazy string references ([066a9ff](https://github.com/happyvertical/sdk/commit/066a9ff80543d5fdafc7e6b9481410f133c4d331)), closes [#142](https://github.com/happyvertical/sdk/issues/142)

# [0.19.0](https://github.com/happyvertical/sdk/compare/v0.18.0...v0.19.0) (2025-10-08)


### Features

* **agents:** simplify Agent base class to minimal feature set ([2bf662f](https://github.com/happyvertical/sdk/commit/2bf662f66e9005421c6b07dd4303e3da5564fe3f))

# [0.18.0](https://github.com/happyvertical/sdk/compare/v0.17.0...v0.18.0) (2025-10-07)


### Bug Fixes

* **config:** add @types/node dependency for Node.js globals ([49279df](https://github.com/happyvertical/sdk/commit/49279df3ecfcb9462d43575deea7ab8a7217296f))


### Features

* **config:** add @happyvertical/config package for centralized configuration ([8ee2195](https://github.com/happyvertical/sdk/commit/8ee219576460c1cd314c4f6c2c107fdf72604e7b))

# [0.17.0](https://github.com/happyvertical/sdk/compare/v0.16.0...v0.17.0) (2025-10-07)


### Bug Fixes

* **accounts:** correct tsconfig.json extends path for modules directory ([7f4871e](https://github.com/happyvertical/sdk/commit/7f4871edbb2044e6b3c1b675bbe852d6a129b338))
* **accounts:** update build configuration for new directory structure ([7f15828](https://github.com/happyvertical/sdk/commit/7f15828a68787efdd726a4994345d4d23d2c1e59))


### Features

* **accounts:** add flexible accounting ledger module ([246997e](https://github.com/happyvertical/sdk/commit/246997e802b5c4164d4b3bb71827250700eb8c4c))

# [0.16.0](https://github.com/happyvertical/sdk/compare/v0.15.0...v0.16.0) (2025-10-07)


### Bug Fixes

* **build:** add missing gnode package to build configuration ([38959bf](https://github.com/happyvertical/sdk/commit/38959bf1bd8256a0f60400654a06949b09959ded))
* **gnode:** add missing tsconfig.build.json ([8d7c99b](https://github.com/happyvertical/sdk/commit/8d7c99be4b92c1e440722ba7362f32ac9d8e4b2d))
* **refactor:** update all config files for core/modules structure ([15144f6](https://github.com/happyvertical/sdk/commit/15144f66fcdd8c5c3eb2e0804a701dfb947ac28b))
* **spider:** handle gzip/deflate decompression correctly ([c2ef20f](https://github.com/happyvertical/sdk/commit/c2ef20f6e5715f339d7b1b8f12b61c122e8819df))
* **spider:** increase timeout for network-dependent tests ([0b69f4b](https://github.com/happyvertical/sdk/commit/0b69f4bd15c378605e0740e3dd359daacbab306e))
* **spider:** replace httpbin.org with example.com in tests ([5a0186f](https://github.com/happyvertical/sdk/commit/5a0186f5a4589c486804f46178eac6f81dc8cc11))
* **workflow:** update release workflow for core/modules structure ([6295470](https://github.com/happyvertical/sdk/commit/6295470ecd55a4acb36025848d125251a0b77991))

# [0.15.0](https://github.com/happyvertical/sdk/compare/v0.14.0...v0.15.0) (2025-10-06)


### Bug Fixes

* **assets:** replace any types with unknown for type safety ([5111086](https://github.com/happyvertical/sdk/commit/5111086030a3f858971249ea4a381142b8eb9d28))
* **profiles:** remove skipLibCheck and fix Field/slug type incompatibilities ([77c7ec8](https://github.com/happyvertical/sdk/commit/77c7ec8c4183cbb275259b3bbd1011e13a25a540))
* **smrt:** address Copilot review comments ([08ad268](https://github.com/happyvertical/sdk/commit/08ad26896dc8d7948de8d8ff9915946e1944f309))
* **smrt:** explicitly convert Field to string for TypeScript type compatibility ([20e27f7](https://github.com/happyvertical/sdk/commit/20e27f7193b37b20285740e8220faa9171f6ab68))
* **smrt:** fix TypeScript errors in tool-executor, bus, rest-adapter, and rest generator ([44ad707](https://github.com/happyvertical/sdk/commit/44ad707715e8a4d21c2be54a57e730f4c83e2b7c))
* **smrt:** relax static factory type constraint for protected constructors ([ad6e926](https://github.com/happyvertical/sdk/commit/ad6e9262fcb4b1660823bd834addff425125d9b7))
* **smrt:** remove unused type aliases to fix linter warnings ([4d7148b](https://github.com/happyvertical/sdk/commit/4d7148b1b0357ae954830c7680b3055b8ccac417))
* **smrt:** resolve naming conflict between config and decorator ([5816c22](https://github.com/happyvertical/sdk/commit/5816c22606a505b3c082fdad0f74ab783165d999))
* **smrt:** support both simple and Field-based property patterns ([a5f5e8f](https://github.com/happyvertical/sdk/commit/a5f5e8f35a4e4d25dbb361908c50e600441a0c1b))
* **smrt:** use InstanceType<T> for proper collection type inference ([51b260e](https://github.com/happyvertical/sdk/commit/51b260eba506efa7de433500be89a3be69a82c21)), closes [#136](https://github.com/happyvertical/sdk/issues/136)
* **tsconfig:** remove types config from root tsconfig ([870b6f7](https://github.com/happyvertical/sdk/commit/870b6f7617b93a56e361d049f9d978ca8905794b))
* **tsconfig:** resolve composite project conflicts by removing source includes ([bc07723](https://github.com/happyvertical/sdk/commit/bc077237ef1fe49bcfb09d504ada24bba83c69a0))
* **types:** resolve TypeScript project references and type compatibility ([25bdca6](https://github.com/happyvertical/sdk/commit/25bdca6912b71647d0c2540a1d3e4efe3273588e)), closes [#135](https://github.com/happyvertical/sdk/issues/135)


### Features

* **smrt:** add built-in signal adapters for metrics and pub/sub ([6dc11a1](https://github.com/happyvertical/sdk/commit/6dc11a1e7fc8e676a2ca6f89c780a463f4248130)), closes [#134](https://github.com/happyvertical/sdk/issues/134)
* **smrt:** add data sanitization, cleanup methods, and enhanced error logging ([a97cfc3](https://github.com/happyvertical/sdk/commit/a97cfc381a405710384ba951816b5d4a8bf2e674))
* **smrt:** complete static factory pattern migration across all packages ([44566de](https://github.com/happyvertical/sdk/commit/44566de71d3f5248a111037a883e9f3728775120))
* **smrt:** implement static factory pattern for Collections ([9e36dbe](https://github.com/happyvertical/sdk/commit/9e36dbedd40675acd2d80cbe7f2bdca198c0de4d)), closes [#135](https://github.com/happyvertical/sdk/issues/135)
* **smrt:** implement Universal Signaling System with @happyvertical/logger ([7d9a8ad](https://github.com/happyvertical/sdk/commit/7d9a8ad61da8fa191302a772ef696785c3c8692f)), closes [#134](https://github.com/happyvertical/sdk/issues/134)
* **smrt:** integrate SignalBus into ToolExecutor for automatic method tracking ([9a9ac4c](https://github.com/happyvertical/sdk/commit/9a9ac4ce7c75d7f0f8ef98a621aee68a795427fb)), closes [#134](https://github.com/happyvertical/sdk/issues/134)
* **types,smrt:** create @happyvertical/types package and add SignalBus to smrt ([7b4b755](https://github.com/happyvertical/sdk/commit/7b4b755c25a8ba8c5a0dec35bb36c3b7170ca780)), closes [#134](https://github.com/happyvertical/sdk/issues/134)

# [0.14.0](https://github.com/happyvertical/sdk/compare/v0.13.0...v0.14.0) (2025-10-06)


### Features

* **smrt:** implement AI function calling for SMRT object methods ([789493c](https://github.com/happyvertical/sdk/commit/789493c3bd8541ec144e0d15353c79a6a82db527)), closes [#132](https://github.com/happyvertical/sdk/issues/132) [#132](https://github.com/happyvertical/sdk/issues/132)

# [0.13.0](https://github.com/happyvertical/sdk/compare/v0.12.0...v0.13.0) (2025-10-05)


### Bug Fixes

* **ci:** install Playwright browsers for CrawleeAdapter tests ([933035f](https://github.com/happyvertical/sdk/commit/933035f8e90c2284a823b57ff300b0ca31c92ec9))
* **content:** fix initialize() return types and exclude app code from build ([8e44621](https://github.com/happyvertical/sdk/commit/8e446215f2de4d26bd6da28c7993afa5cda66e81))
* **products:** align build configuration with content/events standards ([549f89e](https://github.com/happyvertical/sdk/commit/549f89ea1b1838bc3350f918b0f7f698f7126c9a))
* **profiles:** add tsconfig.build.json and fix smrt/fields imports ([5b6e279](https://github.com/happyvertical/sdk/commit/5b6e27913c6035194b71d95bcf175f65b267a4e4))
* **smrt,tags:** resolve TypeScript compilation errors ([7de33af](https://github.com/happyvertical/sdk/commit/7de33afe956ac94560fea77cbc06583ca0cc19e3))
* **smrt:** add null check for optional command handler ([1239a2b](https://github.com/happyvertical/sdk/commit/1239a2be974280f6c6bb45c5ffe408a442ce023e))
* **tags:** change private backing fields to protected for base class compatibility ([f0093f0](https://github.com/happyvertical/sdk/commit/f0093f0b7ace5a4d478b812f8f6bd418c29b592e))
* **translator:** skip LibreTranslate integration tests in CI environments ([a4be09d](https://github.com/happyvertical/sdk/commit/a4be09d17e954eed3d0af63b4d68309d9fe30d1d))


### Features

* **packages:** update products and sql packages ([674bdfd](https://github.com/happyvertical/sdk/commit/674bdfd2f20624e94a7362a3ac7095cda49ad3a0))
* **sdk:** add 10 new packages for expanded functionality ([688f12a](https://github.com/happyvertical/sdk/commit/688f12a79acd467a590eb377382dd15b9a81a78d))
* **smrt:** enhance framework core with improved collection management and schema handling ([dd1b6be](https://github.com/happyvertical/sdk/commit/dd1b6be74881b466c36f84dd9422231af579e1f9))
* **spider:** refactor to provider pattern with three adapters ([ae0e0f7](https://github.com/happyvertical/sdk/commit/ae0e0f7279d78499e8495074792918c16dcbe7b0))


### BREAKING CHANGES

* **spider:** Complete API redesign to align with SDK provider pattern

This commit introduces a major refactoring of the @happyvertical/spider package:

## New Architecture

- **Provider Pattern**: Factory function `getSpider()` returns adapter instances
- **Three Adapters**:
  - Simple: Fast HTTP with undici + cheerio (static content)
  - DOM: happy-dom processing (complex HTML normalization)
  - Crawlee: Playwright browser automation (dynamic/JS content)
- **Standardized Interface**: All adapters implement `ISpiderAdapter`
- **Unified Page Object**: Consistent return type across all adapters

## Key Features

- Built-in caching via @happyvertical/cache with configurable expiry
- Navigation expansion: Crawlee auto-clicks accordions/dropdowns
- Link extraction: All adapters return discovered links
- Error handling: ValidationError and NetworkError types
- TypeScript: Full type safety with discriminated unions

## Performance

Based on Bentley town council integration test:
- Simple: ~200ms (static HTML)
- DOM: ~500ms (normalized HTML)
- Crawlee: ~8000ms (full browser, navigation expansion)
- Cached: ~5ms (10-100x speedup)

## Breaking Changes

v1.x API removed:
- `fetchPageSource()` → `getSpider().fetch()`
- `parseIndexSource()` → `page.links` (automatic)
- `createWindow()` → use happy-dom directly
- `processHtml()` → use DOM adapter

## Migration

```typescript
// Before (v1.x)
const html = await fetchPageSource({ url, cheap: true });
const links = await parseIndexSource(html);

// After (v2.x)
const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch(url);
const links = page.links;
```

## Documentation

- Comprehensive README with examples for all adapters
- Real-world use case: Bentley town PDF extraction
- Migration guide from v1.x
- Best practices for ethical web scraping
- Integration examples with @happyvertical/ai, @happyvertical/pdf, @happyvertical/content

## Testing

- Integration tests with real-world website (Bentley town)
- Caching performance validation
- Navigation expansion verification
- Error handling coverage

Closes #<issue-number-if-applicable>

# [0.12.0](https://github.com/happyvertical/sdk/compare/v0.11.0...v0.12.0) (2025-10-02)


### Bug Fixes

* **smrt:** address Copilot review comments for robustness and code quality ([85ba432](https://github.com/happyvertical/sdk/commit/85ba432cb24afc853b90f33aebd1a274457d6c79)), closes [#121](https://github.com/happyvertical/sdk/issues/121)
* **smrt:** fix ESM module mocking patterns in CLI tests ([5e859be](https://github.com/happyvertical/sdk/commit/5e859beff997912377c868565a0cfc74d64229ce))
* **smrt:** fix test failures in scanner and sveltekit-generator ([473e1d6](https://github.com/happyvertical/sdk/commit/473e1d683e9225d43ad75880b4f6bf55973fac94))
* **smrt:** fix unused variable linter warning in git-loader ([d2023ee](https://github.com/happyvertical/sdk/commit/d2023eed47495f3586934dc346bec7d6d8e5c3d8))
* **smrt:** resolve property inheritance bug and TypeScript compilation errors ([472705b](https://github.com/happyvertical/sdk/commit/472705b31eb733171d8024ecbc7775185083bf30))


### Features

* **smrt:** add security hardening and comprehensive documentation ([a3e571f](https://github.com/happyvertical/sdk/commit/a3e571ffa7e84a0cb1322b69ed78b80bf0de001d))
* **smrt:** add unified CLI with template discovery system ([82f11fc](https://github.com/happyvertical/sdk/commit/82f11fc3e29b45ed7e02f478f6dcfbcc5f28bbe2)), closes [#120](https://github.com/happyvertical/sdk/issues/120)
* **utils:** extract CLI argument parsing to reusable utility ([e8251de](https://github.com/happyvertical/sdk/commit/e8251ded860bda2f47168f6cb2bcfd18588b71fb))

# [0.11.0](https://github.com/happyvertical/sdk/compare/v0.10.0...v0.11.0) (2025-10-01)


### Bug Fixes

* **smrt:** complete REST persistence adapter with property initialization ([61aa39b](https://github.com/happyvertical/sdk/commit/61aa39b390ee376cec39239cf3bf550b6027d00e))
* **smrt:** resolve linter warning for unused variable in sql-adapter ([4614cfa](https://github.com/happyvertical/sdk/commit/4614cfa0bc391adede8b2b923afc1adfbc8fc291))


### Features

* **smrt:** add persistence abstraction layer for REST backends ([5214021](https://github.com/happyvertical/sdk/commit/5214021b4deeb4e03467cbc03c4bc7024be121cc))
* **smrt:** implement advanced ObjectRegistry optimizations ([e87cbfb](https://github.com/happyvertical/sdk/commit/e87cbfb334a5b8a9b8b1c55fcabe7b772e9646d6))
* **smrt:** implement automated runtime relationship support ([2c322cc](https://github.com/happyvertical/sdk/commit/2c322ccf2a28d247914bd35e9598b3b360cb8c18))
* **smrt:** implement Phase 4 & 5 performance optimizations ([bc2220f](https://github.com/happyvertical/sdk/commit/bc2220fe9c40b888bee2b1e85ab6bbca655ac0ed)), closes [#119](https://github.com/happyvertical/sdk/issues/119)

# [0.10.0](https://github.com/happyvertical/sdk/compare/v0.9.0...v0.10.0) (2025-10-01)


### Bug Fixes

* **smrt:** add middleware to serve default HTML when no index.html exists ([33e0e04](https://github.com/happyvertical/sdk/commit/33e0e04efdd3ea26dee59aa9b3f0362800abd2e9))
* **smrt:** correct TypeScript visibility and Svelte 5 reactivity ([7ea2fc1](https://github.com/happyvertical/sdk/commit/7ea2fc1aea7df28349509fb368a9076c71f81ec0))


### Features

* **smrt:** add default dev UI for library development ([382b645](https://github.com/happyvertical/sdk/commit/382b645703c499cfe5a0fc452af9b29e8a951799)), closes [#116](https://github.com/happyvertical/sdk/issues/116)
* **smrt:** implement default development UI with template-literal-free code ([58d4c08](https://github.com/happyvertical/sdk/commit/58d4c08cbe29fc70ae0b4d546d8b9d9063fe9519)), closes [#116](https://github.com/happyvertical/sdk/issues/116)

# [0.9.0](https://github.com/happyvertical/sdk/compare/v0.8.1...v0.9.0) (2025-09-30)


### Features

* add @happyvertical/gnode federation package ([28ca4dc](https://github.com/happyvertical/sdk/commit/28ca4dc4409205ce986f9945e7e5462df38c3247))

## [0.8.1](https://github.com/happyvertical/sdk/compare/v0.8.0...v0.8.1) (2025-09-30)

# [0.8.0](https://github.com/happyvertical/sdk/compare/v0.7.5...v0.8.0) (2025-09-29)


### Bug Fixes

* **content:** correct build output filename to match package.json exports ([f53d6cd](https://github.com/happyvertical/sdk/commit/f53d6cd7ca7ed70a5081e5f5295a80b465d00fa7))
* **sql:** ensure LibSQL Node.js runtime resolution for in-memory databases ([77332c6](https://github.com/happyvertical/sdk/commit/77332c6075c0a33744258a5109f584688a53bf6b))


### Code Refactoring

* **smrt:** eliminate static create() pattern using direct instantiation ([410634c](https://github.com/happyvertical/sdk/commit/410634c3238d7f4a0e8cfb85287b83e3de89b470))


### Features

* **sql:** add schema manager with JSON manifest support ([bdbbfe8](https://github.com/happyvertical/sdk/commit/bdbbfe880f1f68f6f7a068b19947918e433550c6))


### BREAKING CHANGES

* **smrt:** SmrtCollection.create() now uses direct instantiation

Changes:
- Modified SmrtCollection.create() to directly instantiate objects
- Changed SmrtObject.initialize() from protected to public
- Eliminates need for static create() methods on SMRT objects
- Fixes Content collection test failures (236 tests passing)

Technical Details:
- Old pattern required every SMRT object to implement static create()
- New pattern: `new this._itemClass(params); await instance.initialize()`
- Leverages modern @smrt() decorator and registry system
- Simplified, more maintainable instantiation pattern

Benefits:
- No more boilerplate static create() methods required
- Consistent instantiation across all SMRT objects
- Works with all @smrt decorated classes automatically
- Cleaner codebase in closed ecosystem

Related to packages/content test failures - now all passing

## [0.7.5](https://github.com/happyvertical/sdk/compare/v0.7.4...v0.7.5) (2025-09-29)


### Bug Fixes

* **sql:** implement smart database instance detection in getDatabase ([cfa9346](https://github.com/happyvertical/sdk/commit/cfa93463d29c00bb8bfce0820f8b9b13cc777e79)), closes [#112](https://github.com/happyvertical/sdk/issues/112)

## [0.7.4](https://github.com/happyvertical/sdk/compare/v0.7.3...v0.7.4) (2025-09-29)


### Bug Fixes

* **sql:** eliminate environment-specific behavior and dynamic require issues ([b794e0c](https://github.com/happyvertical/sdk/commit/b794e0c8a5c7f5ea8dc84097f278bbaf04151e76))
* **sql:** eliminate environment-specific behavior that breaks testing ([25ca375](https://github.com/happyvertical/sdk/commit/25ca375fd79a645f92fc8f6d3d87d9947682284a)), closes [#106](https://github.com/happyvertical/sdk/issues/106)

## [0.7.3](https://github.com/happyvertical/sdk/compare/v0.7.2...v0.7.3) (2025-09-28)


### Bug Fixes

* **sql:** resolve LibSQL dynamic require issue completely ([e9cebca](https://github.com/happyvertical/sdk/commit/e9cebca64f1c93abb3d0fbcf29c5c4c6c137ebf8)), closes [#106](https://github.com/happyvertical/sdk/issues/106)

## [0.7.2](https://github.com/happyvertical/sdk/compare/v0.7.1...v0.7.2) (2025-09-28)


### Bug Fixes

* **smrt:** resolve consumer plugin distribution issue ([07bb93b](https://github.com/happyvertical/sdk/commit/07bb93b561e0f04b2d76db771389b3a994b35b81))

## [0.7.1](https://github.com/happyvertical/sdk/compare/v0.7.0...v0.7.1) (2025-09-28)

# [0.7.0](https://github.com/happyvertical/sdk/compare/v0.6.1...v0.7.0) (2025-09-27)


### Features

* **smrt:** enhance TypeScript introspection with pre-build declarations ([c37c51e](https://github.com/happyvertical/sdk/commit/c37c51e3ebf341100ad58d6572a5236027a1149f))

## [0.6.1](https://github.com/happyvertical/sdk/compare/v0.6.0...v0.6.1) (2025-09-27)


### Bug Fixes

* synchronize all package versions to 0.4.1 ([af05559](https://github.com/happyvertical/sdk/commit/af0555941e706238f059c4dd4709f7f6d9922579))

# [0.6.0](https://github.com/happyvertical/sdk/compare/v0.5.0...v0.6.0) (2025-09-27)


### Features

* standardize build strategy across all packages ([bd45cf6](https://github.com/happyvertical/sdk/commit/bd45cf69d18dad7a3739d11910c4982f92ac1fba))

# [0.5.0](https://github.com/happyvertical/sdk/compare/v0.4.1...v0.5.0) (2025-09-27)


### Bug Fixes

* **smrt:** implement multi-entry build for subpath exports tree-shaking ([6447420](https://github.com/happyvertical/sdk/commit/6447420811d870c670b624d40c7f30ec4423ac3e)), closes [#100](https://github.com/happyvertical/sdk/issues/100)
* update pnpm-lock.yaml for tsx dependency ([fb34bf1](https://github.com/happyvertical/sdk/commit/fb34bf144fb9cad6c382a69225f05d86a16cd8cf))


### Features

* **smrt:** eliminate bundled TypeScript compiler from runtime ([faef180](https://github.com/happyvertical/sdk/commit/faef18006286689b5c33b3efb59c77033e0d2851))

## [0.4.1](https://github.com/happyvertical/sdk/compare/v0.4.0...v0.4.1) (2025-09-27)


### Bug Fixes

* resolve TypeScript compilation errors in @happyvertical/sdk packages ([f9511c9](https://github.com/happyvertical/sdk/commit/f9511c9a533823134db4f4209cf2007e0f0bb602)), closes [#98](https://github.com/happyvertical/sdk/issues/98)

# [0.4.0](https://github.com/happyvertical/sdk/compare/v0.3.3...v0.4.0) (2025-09-26)


### Features

* **smrt:** add custom action support to [@smrt](https://github.com/smrt) decorator configuration ([ce84e77](https://github.com/happyvertical/sdk/commit/ce84e77d5f42c650815649a498bb5cfe9eff5ab2)), closes [#96](https://github.com/happyvertical/sdk/issues/96)
* **smrt:** implement custom action support and resolve build issues ([5536c16](https://github.com/happyvertical/sdk/commit/5536c1664efe37ee49e3491c402157e43b01b65a)), closes [#96](https://github.com/happyvertical/sdk/issues/96) [#96](https://github.com/happyvertical/sdk/issues/96)

## [0.3.3](https://github.com/happyvertical/sdk/compare/v0.3.2...v0.3.3) (2025-09-26)


### Bug Fixes

* disable API Extractor rollup to support virtual modules ([1ba604f](https://github.com/happyvertical/sdk/commit/1ba604f4b9e2f712e352973d561ec32066c14633))
* improve TypeScript declaration generation for CI compatibility ([f97e3aa](https://github.com/happyvertical/sdk/commit/f97e3aa1dc3c4fca4cd6c217fd1247550754e6ac))
* re-enable TypeScript declaration generation for all packages ([bfaa9ff](https://github.com/happyvertical/sdk/commit/bfaa9ff9e9011facb96a1735002244f27ff16b31))

## [0.3.2](https://github.com/happyvertical/sdk/compare/v0.3.1...v0.3.2) (2025-09-26)


### Bug Fixes

* resolve package resolution issues by fixing build structure ([e0656b6](https://github.com/happyvertical/sdk/commit/e0656b6a6dcae2348fcdf26c9d8fe09283bea513))

## [0.3.1](https://github.com/happyvertical/sdk/compare/v0.3.0...v0.3.1) (2025-09-26)


### Bug Fixes

* remove duplicate on-merged-main.yaml workflow ([d7a56ec](https://github.com/happyvertical/sdk/commit/d7a56ecadb5b6a51e9bee1a9da45e4884b25bb41))

# [0.3.0](https://github.com/happyvertical/sdk/compare/v0.2.4...v0.3.0) (2025-09-25)


### Bug Fixes

* resolve fundamental GitHub Actions architecture issues ([8e6eb06](https://github.com/happyvertical/sdk/commit/8e6eb06431ec11782bded20f544a74f7d37b90d0))


### Features

* implement clean workflow architecture with environment abstraction ([1dc20f2](https://github.com/happyvertical/sdk/commit/1dc20f2c605ff6fb01ae3ccd7c14272ec2bf8ae4))

## [0.2.4](https://github.com/happyvertical/sdk/compare/v0.2.3...v0.2.4) (2025-09-25)


### Bug Fixes

* comprehensive workflow refactoring for pnpm and proper execution order ([633448d](https://github.com/happyvertical/sdk/commit/633448d610dc846d20b5f24c783c1e064e8b6d3e))

## [0.2.3](https://github.com/happyvertical/sdk/compare/v0.2.2...v0.2.3) (2025-09-25)


### Bug Fixes

* update documentation deployment workflow to use pnpm ([db0dc07](https://github.com/happyvertical/sdk/commit/db0dc07011dfb9e2fba2aa400e72be992c4090da))

## [0.2.2](https://github.com/happyvertical/sdk/compare/v0.2.1...v0.2.2) (2025-09-25)

## [0.2.1](https://github.com/happyvertical/sdk/compare/v0.2.0...v0.2.1) (2025-09-25)


### Bug Fixes

* add npm plugin back to update package versions without publishing ([f332a9b](https://github.com/happyvertical/sdk/commit/f332a9bc779b4ab8df22c4bf9687bfd1bf229e75))

# [0.2.0](https://github.com/happyvertical/sdk/compare/v0.1.0...v0.2.0) (2025-09-25)


### Bug Fixes

* complete v0.x.x semantic-release configuration ([d1f106a](https://github.com/happyvertical/sdk/commit/d1f106ac2b794b52efa86d4fad2fd5aca87e6b3c))
* prevent v1.0.0 releases until ready ([153e71e](https://github.com/happyvertical/sdk/commit/153e71ef6636dad49aaf6ce7a8ae00e16c9db169))
* re-enable automatic release workflow on push to main ([ade8d7f](https://github.com/happyvertical/sdk/commit/ade8d7f66297e1c8bf38452f5d9cf939c3eb8a40))
* remove conventionalcommits preset causing npm plugin loading ([40eca63](https://github.com/happyvertical/sdk/commit/40eca634fc221fc9d5f37faaba17d5faa58b6af6))
* remove pnpm plugin to eliminate npm token validation ([d960c0e](https://github.com/happyvertical/sdk/commit/d960c0ebc44fdd715fdf4cf1c9f440d44ff2a2ae))
* resolve semantic-release workflow failures ([87dbc06](https://github.com/happyvertical/sdk/commit/87dbc067d44fa742b173bf41094673416e326d3c))
* run semantic-release from root only, not all packages ([30c696a](https://github.com/happyvertical/sdk/commit/30c696a5cfd50e875c6f55963514ebbab98f7d9e))
* temporarily disable automatic release workflow ([854802c](https://github.com/happyvertical/sdk/commit/854802cdfa026622efba527145dd68cd763b2da0))


### Features

* implement automated versioning with semantic-release ([891b44c](https://github.com/happyvertical/sdk/commit/891b44c8a8544d68e60c07ac7be0ac8f8025b0dc)), closes [#86](https://github.com/happyvertical/sdk/issues/86)

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.50](https://github.com/happyvertical/sdk/compare/v0.0.49...v0.0.50) (2025-05-20)


### Features

* more details about assigned in test trigger ([3bc89a6](https://github.com/happyvertical/sdk/commit/3bc89a6eb0a2a42bde8c6436802878025e52b1bd))

### [0.0.49](https://github.com/happyvertical/sdk/compare/v0.0.48...v0.0.49) (2025-05-20)


### Features

* a setup_dev script for those who have all the repos in the same parent, eg me ([176c9da](https://github.com/happyvertical/sdk/commit/176c9daa057cd1237ca931980910ca98d2cf7b80))
* add gitea workflows for Claude agent integration ([a293227](https://github.com/happyvertical/sdk/commit/a2932276a0fb7de73dc5af86187e77ea1edb827c))
* added prettyDate function to utils ([41b0dfc](https://github.com/happyvertical/sdk/commit/41b0dfcdd484106105b6274cea2479e2bf6aca02))
* here comes the agentic coding, CLAUDE.md ([0bde29f](https://github.com/happyvertical/sdk/commit/0bde29f22ac9063fa6c21554088108306574ee98))
* migrated to biome ([b2c611c](https://github.com/happyvertical/sdk/commit/b2c611c7b8948f0cc0d0703434bb765ea4973429))
* the starts of a contributing guide ripped off from repomix base rules ([c0d7425](https://github.com/happyvertical/sdk/commit/c0d7425a605107df9707452cd41fc1bde6a0b7d6))
* update git hooks to use lefthook ([ad5261e](https://github.com/happyvertical/sdk/commit/ad5261ef917c1815c4f08cd56d1d8504acc33f2c))


### Bug Fixes

* setup_dev relative to script and use bin/env ([af3ccd1](https://github.com/happyvertical/sdk/commit/af3ccd17fbc262f27828f795c147bace54812f36))

### [0.0.48](https://github.com/happyvertical/sdk/compare/v0.0.47...v0.0.48) (2025-03-26)


### Features

* **smrt:** added count method to collection ([1feef8d](https://github.com/happyvertical/sdk/commit/1feef8ddaecf1a2ebcfeb97ac950b82d8ce2a90e))


### Bug Fixes

* **svelte:** description in list rendered as html ([83284fb](https://github.com/happyvertical/sdk/commit/83284fbda58d829cd0b73ba09076cdd360375df3))

### [0.0.47](https://github.com/happyvertical/sdk/compare/v0.0.46...v0.0.47) (2025-03-12)


### Bug Fixes

* import uses .js ([f52f924](https://github.com/happyvertical/sdk/commit/f52f92491784b8c4bec87376ace4ca752af19e8a))

### [0.0.46](https://github.com/happyvertical/sdk/compare/v0.0.45...v0.0.46) (2025-03-12)

### [0.0.45](https://github.com/happyvertical/sdk/compare/v0.0.44...v0.0.45) (2025-03-12)


### Features

* added orderBy to collection list ([caa9ded](https://github.com/happyvertical/sdk/commit/caa9ded99ad80bca8a1d3b135e82951dfec3d860))

### [0.0.44](https://github.com/happyvertical/sdk/compare/v0.0.43...v0.0.44) (2025-02-26)


### Features

* build:watch script for packages ([2e05566](https://github.com/happyvertical/sdk/commit/2e05566816d1965a16e7d7db68ce34eec9f01260))
* standardised buildWhere for sql queries, comparisons operators managed in object keys ([2b33211](https://github.com/happyvertical/sdk/commit/2b332118764d8731a32f38464c47244fab0f78ae))
* standardized scripts in like packages, added dev script ([c388a34](https://github.com/happyvertical/sdk/commit/c388a344af994f05f51b573cc66ffbd9eda3bb7e))

### [0.0.43](https://github.com/happyvertical/sdk/compare/v0.0.42...v0.0.43) (2025-02-22)


### Features

* replace semi-implemented "depreacted" field with "state" ([75a0b4a](https://github.com/happyvertical/sdk/commit/75a0b4ac4a21a1092563d832e241093e0d2f42ff))

### [0.0.42](https://github.com/happyvertical/sdk/compare/v0.0.41...v0.0.42) (2025-02-22)


### Bug Fixes

* loadFromSlug context default to blank string ([2c07bf7](https://github.com/happyvertical/sdk/commit/2c07bf702683884e0632a5bce7aaecf0f42eb8b1))

### [0.0.41](https://github.com/happyvertical/sdk/compare/v0.0.40...v0.0.41) (2025-02-22)


### Bug Fixes

* missing context vars ([e0c3db8](https://github.com/happyvertical/sdk/commit/e0c3db80d35eba692c7433a6fc7c705bd777b564))

### [0.0.40](https://github.com/happyvertical/sdk/compare/v0.0.39...v0.0.40) (2025-02-21)


### Features

* added a general purpose context to go along with the slug ([bbf9ef2](https://github.com/happyvertical/sdk/commit/bbf9ef29f7eb778f547941985237e10037cf90c8))

### [0.0.39](https://github.com/happyvertical/sdk/compare/v0.0.38...v0.0.39) (2025-02-19)


### Features

* **smrt:** added toJSON to Content ([897cb4f](https://github.com/happyvertical/sdk/commit/897cb4f431108b6b37ee51fea8b5f74cc4bea755))

### [0.0.38](https://github.com/happyvertical/sdk/compare/v0.0.37...v0.0.38) (2025-02-18)


### Bug Fixes

* storybook fixes ([d74d142](https://github.com/happyvertical/sdk/commit/d74d1423b3fb789c429ddc24bfa1815578ee8a1e))

### [0.0.37](https://github.com/happyvertical/sdk/compare/v0.0.36...v0.0.37) (2025-02-17)


### Features

* (barely) improve styling of article list and article ([9e6b5be](https://github.com/happyvertical/sdk/commit/9e6b5be456d18a45ae771a1684af3cd1a8217ef6))


### Bug Fixes

* css imports ([4c92e94](https://github.com/happyvertical/sdk/commit/4c92e941f6753e46a6baa9a3e8bf0583f3b551e0))

### [0.0.36](https://github.com/happyvertical/sdk/compare/v0.0.35...v0.0.36) (2025-02-17)


### Features

* added status column to content ([7830150](https://github.com/happyvertical/sdk/commit/78301500e2ae8045ac0440df0d89b6f6f5ca2537))

### [0.0.35](https://github.com/happyvertical/sdk/compare/v0.0.34...v0.0.35) (2025-02-17)


### Bug Fixes

* collection.get formats data to js ([a3e8dea](https://github.com/happyvertical/sdk/commit/a3e8deab555139eba8b03d8c40f6a9e16da7a4a2))

### [0.0.34](https://github.com/happyvertical/sdk/compare/v0.0.33...v0.0.34) (2025-02-16)


### Features

* specify contents directory for mirror function ([868f7c8](https://github.com/happyvertical/sdk/commit/868f7c8f0fa7a5fcaa56ce9a13872930c3da0422))

### [0.0.33](https://github.com/happyvertical/sdk/compare/v0.0.32...v0.0.33) (2025-02-15)


### Bug Fixes

* **svelte:** remove test style ([b32b3d5](https://github.com/happyvertical/sdk/commit/b32b3d5f37b6bd9e080b4362ff5f088de6c82ab4))

### [0.0.32](https://github.com/happyvertical/sdk/compare/v0.0.31...v0.0.32) (2025-02-15)


### Bug Fixes

* contentToString and stringToContent dont need to be async ([8279dd9](https://github.com/happyvertical/sdk/commit/8279dd92feb7c61652e5191bc26cace16dc2d901))

### [0.0.31](https://github.com/happyvertical/sdk/compare/v0.0.30...v0.0.31) (2025-02-15)


### Bug Fixes

* move pg from devDeps to deps in sql ([d27cdca](https://github.com/happyvertical/sdk/commit/d27cdca65880a0f2d22fa984a3ad7a40572c5462))

### [0.0.30](https://github.com/happyvertical/sdk/compare/v0.0.29...v0.0.30) (2025-02-15)

### [0.0.29](https://github.com/happyvertical/sdk/compare/v0.0.28...v0.0.29) (2025-02-15)


### Bug Fixes

* removed build config ([1dafd38](https://github.com/happyvertical/sdk/commit/1dafd382aa82450c4f07dbf2db81b3dad891a5a5))

### [0.0.28](https://github.com/happyvertical/sdk/compare/v0.0.27...v0.0.28) (2025-02-15)


### Features

* added vitest.config to smrt, vitest.workspace to root ([2791894](https://github.com/happyvertical/sdk/commit/279189473509d04054c6c46a0b1f7b8ceaa07ce4))
* ignore .svelte-kit ([8ba87d9](https://github.com/happyvertical/sdk/commit/8ba87d936d9a720f608a635bfb346a484a14cc9a))
* **smrt:** contentToString and stringToContent functions ([3b7b004](https://github.com/happyvertical/sdk/commit/3b7b004cc5261da990778e368ef23d85a5cb7740))

### [0.0.27](https://github.com/happyvertical/sdk/compare/v0.0.26...v0.0.27) (2025-02-15)

### [0.0.26](https://github.com/happyvertical/sdk/compare/v0.0.25...v0.0.26) (2025-02-15)


### Bug Fixes

* dont verify commit in version bump ([42c27a1](https://github.com/happyvertical/sdk/commit/42c27a1cef4a1ecbb1c9ca487217f8230439269e))

### [0.0.25](https://github.com/happyvertical/sdk/compare/v0.0.24...v0.0.25) (2025-02-15)


### Features

* package component exports ([edf178d](https://github.com/happyvertical/sdk/commit/edf178d36020bdd59481c2e3a954fdf78db0afbb))
* **svelte:** a very basic article component intial commit ([d7c279b](https://github.com/happyvertical/sdk/commit/d7c279bee760cb95b01d56dfddcb86cf3e8095a8))

### [0.0.24](https://github.com/happyvertical/sdk/compare/v0.0.23...v0.0.24) (2025-02-14)

### [0.0.23](https://github.com/happyvertical/sdk/compare/v0.0.22...v0.0.23) (2025-02-14)


### Bug Fixes

* remove the import style that i thought i already had ([32cf26a](https://github.com/happyvertical/sdk/commit/32cf26a3b77374f3c357dabc35a649f37145cbc2))

### [0.0.22](https://github.com/happyvertical/sdk/compare/v0.0.21...v0.0.22) (2025-02-14)


### Features

* moved styles to own directory, renamed export styles ([00b9b6a](https://github.com/happyvertical/sdk/commit/00b9b6a67ed005c0e8dde0fef3a976db8f898fc7))


### Bug Fixes

* added clsx and tailwind-merge to deps ([caf1f5b](https://github.com/happyvertical/sdk/commit/caf1f5bc85352fa5e294f211492f116b02dafe2d))
* dont import styles in index.ts ([96eab25](https://github.com/happyvertical/sdk/commit/96eab25070c1395cf18493905b95e703ea457d8b))

### [0.0.21](https://github.com/happyvertical/sdk/compare/v0.0.20...v0.0.21) (2025-02-14)


### Features

* **svelte:** export styles ([e3a3c9e](https://github.com/happyvertical/sdk/commit/e3a3c9e632af89fa673e2e3220bcc79de0a3b6c8))

### [0.0.20](https://github.com/happyvertical/sdk/compare/v0.0.19...v0.0.20) (2025-02-14)


### Bug Fixes

* more default exports ([c5a5be5](https://github.com/happyvertical/sdk/commit/c5a5be54db6e84c062e71e8c80e4b418c47d8605))

### [0.0.19](https://github.com/happyvertical/sdk/compare/v0.0.18...v0.0.19) (2025-02-14)


### Features

* **svelte:** added utils and tailwind-merge dep ([2876a80](https://github.com/happyvertical/sdk/commit/2876a80501cbf18e53215c641847220c9f331134))

### [0.0.18](https://github.com/happyvertical/sdk/compare/v0.0.17...v0.0.18) (2025-02-14)


### Bug Fixes

* set custom registry to default and also also in the svelte npmrc ([9908bde](https://github.com/happyvertical/sdk/commit/9908bded4e9f2fa8d3029230ed3071d580d1fe91))

### [0.0.17](https://github.com/happyvertical/sdk/compare/v0.0.16...v0.0.17) (2025-02-14)


### Features

* export Card ([38201be](https://github.com/happyvertical/sdk/commit/38201be9a5940e39ab552e8f8a44025fba11b1eb))


### Bug Fixes

* card export ([47f7807](https://github.com/happyvertical/sdk/commit/47f7807f158565566c19ed32ea395fef09697739))

### [0.0.16](https://github.com/happyvertical/sdk/compare/v0.0.15...v0.0.16) (2025-02-14)


### Features

* installed eslint, fixed a couple errors, added some rules to skip others and a bunch of warnings ([c3178bc](https://github.com/happyvertical/sdk/commit/c3178bc7ec8433d32b8191d35f4c247f5d5ea441))
* **svelte:** initial commit ([028c884](https://github.com/happyvertical/sdk/commit/028c884ecdf2c0e8f37e4298d30fb711dc2e6268))


### Bug Fixes

* better typing ([92c032d](https://github.com/happyvertical/sdk/commit/92c032dfdffceb66b87a742d3748054a135086fe))
* unignore lib and commit sveltes ([4440ae1](https://github.com/happyvertical/sdk/commit/4440ae12ce72e01854f2680fa15555010b88e759))

### [0.0.15](https://github.com/happyvertical/sdk/compare/v0.0.14...v0.0.15) (2025-02-13)


### Bug Fixes

* missed some contentDir ([46f7448](https://github.com/happyvertical/sdk/commit/46f744826ceaae6b36ad1f50eb855cf5c2581da4))

### [0.0.14](https://github.com/happyvertical/sdk/compare/v0.0.13...v0.0.14) (2025-02-13)


### Bug Fixes

* **pdf:** add vite config, more pdfs ([386fcc7](https://github.com/happyvertical/sdk/commit/386fcc7a21263cc052aaa419a0647629d25b4464))

### [0.0.13](https://github.com/happyvertical/sdk/compare/v0.0.12...v0.0.13) (2025-02-13)

### [0.0.12](https://github.com/happyvertical/sdk/compare/v0.0.11...v0.0.12) (2025-02-13)

### [0.0.11](https://github.com/happyvertical/sdk/compare/v0.0.10...v0.0.11) (2025-02-13)


### Bug Fixes

* .js on dynamic imports for db adapter ([0e11c6b](https://github.com/happyvertical/sdk/commit/0e11c6be252b834aaf24d9dc43950e66af4227b0))

### [0.0.10](https://github.com/happyvertical/sdk/compare/v0.0.9...v0.0.10) (2025-02-13)


### Bug Fixes

* proper extension for pdfjs ([01ffa20](https://github.com/happyvertical/sdk/commit/01ffa20f236cae3b3f9e348b85b843d630f28bc1))

### [0.0.9](https://github.com/happyvertical/sdk/compare/v0.0.8...v0.0.9) (2025-02-13)


### Bug Fixes

* couple missed ones ([febcbb1](https://github.com/happyvertical/sdk/commit/febcbb1672cdeff05006c1e314d4fc27b6c43485))

### [0.0.8](https://github.com/happyvertical/sdk/compare/v0.0.7...v0.0.8) (2025-02-13)

### [0.0.7](https://github.com/happyvertical/sdk/compare/v0.0.6...v0.0.7) (2025-02-13)

### [0.0.6](https://github.com/happyvertical/sdk/compare/v0.0.5...v0.0.6) (2025-02-12)

### [0.0.5](https://github.com/happyvertical/sdk/compare/v0.0.4...v0.0.5) (2025-02-12)

### [0.0.4](https://github.com/happyvertical/sdk/compare/v0.0.3...v0.0.4) (2025-02-12)

### 0.0.3 (2025-02-12)


### Features

* added publish command to root package.json ([20a6b00](https://github.com/happyvertical/sdk/commit/20a6b00b5ea9c239d71146783eded7090b2c044e))
* **ai:** intial commit ([12b2039](https://github.com/happyvertical/sdk/commit/12b20393b29d6248a5c3749beb6318736474b20f))
* **db:** initial commit, will be renamed from sql to db ([c6e2010](https://github.com/happyvertical/sdk/commit/c6e2010b0ef51af1772db961dc3ffebe49fbe75b))
* **files:** initial commit ([4ae52a9](https://github.com/happyvertical/sdk/commit/4ae52a94f2d91f5abb4ec8af4889a93c1ca44954))
* initial commit ([2d174da](https://github.com/happyvertical/sdk/commit/2d174da8910155b7d969d88a91210d5fba73c195))
* **pdf:** intiaial commit ([1d99717](https://github.com/happyvertical/sdk/commit/1d99717a259a866e1476f20e70f00c2441306883))
* publish-packages script ([3495ef3](https://github.com/happyvertical/sdk/commit/3495ef3064e3b96e0ff30a1600715aa8e3287cde))
* **smrt:** inital comit .. i mean c-o-m-m-i-t ([5251819](https://github.com/happyvertical/sdk/commit/525181921cb55a5b7e4856ac85205a8221a2dcfd))
* **spider:** initial commit ([d23c0c7](https://github.com/happyvertical/sdk/commit/d23c0c73de53735921a472ded710a0f52d91c364))
* **svelte:** initial commit ([384a812](https://github.com/happyvertical/sdk/commit/384a812cdb0843e0f18d1eb783db3847dd71722a))
* typescript happy.. for now ([ed0071e](https://github.com/happyvertical/sdk/commit/ed0071e7d449fce9ed9103d28f22b23a4bc0579b))
* use standard commits to bump version ([c2a789b](https://github.com/happyvertical/sdk/commit/c2a789ba253002aa8d0bb07a51372f6ed10c5925))
* **utils:** initial commit ([3a03ba2](https://github.com/happyvertical/sdk/commit/3a03ba210115ef23f3713bfdbf2ce1c0844aa5a3))


### Bug Fixes

* add auth for package repo ([fe3b7e0](https://github.com/happyvertical/sdk/commit/fe3b7e0d7792ed98e9c87400ea587d03da4da3d3))
* added build, skip verify in commit - should only need one, trying both ([0be2e61](https://github.com/happyvertical/sdk/commit/0be2e61f2d79d5a988a2aad642b00f0b6bea7267))
* added uuid dep ([fea128a](https://github.com/happyvertical/sdk/commit/fea128ad7ba3058947b3755befd713af4ae0fdf5))
* align svelte with base tsconfig compiler options ([fb25953](https://github.com/happyvertical/sdk/commit/fb259537fe5067124dbef21998c1c4d475efd2e8))
* build and typescript fixes for cicd.. i think baseUrl in tsconfig was the head vampire ([62fc552](https://github.com/happyvertical/sdk/commit/62fc552ef528553767bd9f041b6a7a7a5c7d7832))
* config git before release ([55b161b](https://github.com/happyvertical/sdk/commit/55b161be820fd7b29f7c8a16fd159254b99265a9))
* consolidate vite includes to root config ([f02d454](https://github.com/happyvertical/sdk/commit/f02d45495ed28495f711ac684becebdb4999f1a9))
* fetch in exports ([7c753da](https://github.com/happyvertical/sdk/commit/7c753da0754b7c8c77956620764443c3a41d20fc))
* install playwright browsers in cicd ([b0498c6](https://github.com/happyvertical/sdk/commit/b0498c6e7938f3d07f1425badeb07e1e1e048cc3))
* more getTempDir missed ([bb77fba](https://github.com/happyvertical/sdk/commit/bb77fba462d99d8698979a9e245a56d17d6746f0))
* remove packages from deps, exports from files for now ([253b777](https://github.com/happyvertical/sdk/commit/253b777fbf44f45a88608d9297e4eaf7421b3fa5))
* set root to private ([c6d7bb7](https://github.com/happyvertical/sdk/commit/c6d7bb7760e96b3d369926bdd297fef78f07645e))
* setup customer registry sooner ([27dfa34](https://github.com/happyvertical/sdk/commit/27dfa343c288d7914eea54e285a1c14b85f4212d))
* try just no-verify while investigating new build error for svelte ([bf3f5cc](https://github.com/happyvertical/sdk/commit/bf3f5ccef8bb943e5eb940bb9b5c052a23a95ad3))
* verticle -> vertical ([81b8ade](https://github.com/happyvertical/sdk/commit/81b8adec768382abe4170900b621e1cfc74e748d))

### [0.0.2](https://github.com/happyvertical/sdk/compare/v0.0.1...v0.0.2) (2025-02-12)

### 0.0.1 (2025-02-12)


### Features

* added publish command to root package.json ([20a6b00](https://github.com/happyvertical/sdk/commit/20a6b00b5ea9c239d71146783eded7090b2c044e))
* **ai:** intial commit ([12b2039](https://github.com/happyvertical/sdk/commit/12b20393b29d6248a5c3749beb6318736474b20f))
* **db:** initial commit, will be renamed from sql to db ([c6e2010](https://github.com/happyvertical/sdk/commit/c6e2010b0ef51af1772db961dc3ffebe49fbe75b))
* **files:** initial commit ([4ae52a9](https://github.com/happyvertical/sdk/commit/4ae52a94f2d91f5abb4ec8af4889a93c1ca44954))
* initial commit ([2d174da](https://github.com/happyvertical/sdk/commit/2d174da8910155b7d969d88a91210d5fba73c195))
* **pdf:** intiaial commit ([1d99717](https://github.com/happyvertical/sdk/commit/1d99717a259a866e1476f20e70f00c2441306883))
* publish-packages script ([3495ef3](https://github.com/happyvertical/sdk/commit/3495ef3064e3b96e0ff30a1600715aa8e3287cde))
* **smrt:** inital comit .. i mean c-o-m-m-i-t ([5251819](https://github.com/happyvertical/sdk/commit/525181921cb55a5b7e4856ac85205a8221a2dcfd))
* **spider:** initial commit ([d23c0c7](https://github.com/happyvertical/sdk/commit/d23c0c73de53735921a472ded710a0f52d91c364))
* **svelte:** initial commit ([384a812](https://github.com/happyvertical/sdk/commit/384a812cdb0843e0f18d1eb783db3847dd71722a))
* typescript happy.. for now ([ed0071e](https://github.com/happyvertical/sdk/commit/ed0071e7d449fce9ed9103d28f22b23a4bc0579b))
* **utils:** initial commit ([3a03ba2](https://github.com/happyvertical/sdk/commit/3a03ba210115ef23f3713bfdbf2ce1c0844aa5a3))


### Bug Fixes

* add auth for package repo ([fe3b7e0](https://github.com/happyvertical/sdk/commit/fe3b7e0d7792ed98e9c87400ea587d03da4da3d3))
* added build, skip verify in commit - should only need one, trying both ([0be2e61](https://github.com/happyvertical/sdk/commit/0be2e61f2d79d5a988a2aad642b00f0b6bea7267))
* added uuid dep ([fea128a](https://github.com/happyvertical/sdk/commit/fea128ad7ba3058947b3755befd713af4ae0fdf5))
* align svelte with base tsconfig compiler options ([fb25953](https://github.com/happyvertical/sdk/commit/fb259537fe5067124dbef21998c1c4d475efd2e8))
* build and typescript fixes for cicd.. i think baseUrl in tsconfig was the head vampire ([62fc552](https://github.com/happyvertical/sdk/commit/62fc552ef528553767bd9f041b6a7a7a5c7d7832))
* consolidate vite includes to root config ([f02d454](https://github.com/happyvertical/sdk/commit/f02d45495ed28495f711ac684becebdb4999f1a9))
* fetch in exports ([7c753da](https://github.com/happyvertical/sdk/commit/7c753da0754b7c8c77956620764443c3a41d20fc))
* more getTempDir missed ([bb77fba](https://github.com/happyvertical/sdk/commit/bb77fba462d99d8698979a9e245a56d17d6746f0))
* remove packages from deps, exports from files for now ([253b777](https://github.com/happyvertical/sdk/commit/253b777fbf44f45a88608d9297e4eaf7421b3fa5))
* set root to private ([c6d7bb7](https://github.com/happyvertical/sdk/commit/c6d7bb7760e96b3d369926bdd297fef78f07645e))
* setup customer registry sooner ([27dfa34](https://github.com/happyvertical/sdk/commit/27dfa343c288d7914eea54e285a1c14b85f4212d))
* try just no-verify while investigating new build error for svelte ([bf3f5cc](https://github.com/happyvertical/sdk/commit/bf3f5ccef8bb943e5eb940bb9b5c052a23a95ad3))
* verticle -> vertical ([81b8ade](https://github.com/happyvertical/sdk/commit/81b8adec768382abe4170900b621e1cfc74e748d))
