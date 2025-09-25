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
